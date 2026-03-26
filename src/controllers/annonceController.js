// controllers/annonceController.js
const db = require('../config/database');
const { sendBulkNotificationsDirect } = require('./notificationController');

const sendAnnonce = async (req, res) => {
  try {
    const { 
      titre, 
      contenu, 
      cible, 
      centre_id, 
      statut = 'PUBLIE',
      user_ids,
      date_publication,
      date_expiration
    } = req.body;
    
    const createdBy = req.user.id;

    console.log('📤 [ANNONCES] Création annonce:');
    console.log('  Titre:', titre);
    console.log('  Cible:', cible);
    console.log('  Centre ID:', centre_id);
    console.log('  User IDs:', user_ids);
    console.log('  Créé par:', createdBy);

    // Validation
    if (!titre || !contenu || !cible) {
      return res.status(400).json({ 
        error: 'Titre, contenu et cible sont requis' 
      });
    }

    // Valider la cible
    const ciblesValides = ['TOUS', 'CENTRE_SPECIFIQUE', 'ETUDIANTS', 'GESTIONNAIRES'];
    if (!ciblesValides.includes(cible)) {
      return res.status(400).json({ 
        error: `Cible invalide. Valeurs acceptées: ${ciblesValides.join(', ')}`
      });
    }

    // Si cible = CENTRE_SPECIFIQUE, vérifier centre_id
    if (cible === 'CENTRE_SPECIFIQUE' && !centre_id) {
      return res.status(400).json({ 
        error: 'centre_id est requis pour une annonce par centre' 
      });
    }

    // Si cible = ETUDIANTS, vérifier user_ids
    if (cible === 'ETUDIANTS' && (!user_ids || user_ids.length === 0)) {
      return res.status(400).json({ 
        error: 'user_ids est requis pour une annonce personnalisée' 
      });
    }

    // 1. Sauvegarder l'annonce
    const annonceResult = await db.query(
      `INSERT INTO annonces 
       (titre, contenu, cible, centre_id, statut, created_by, date_publication, date_expiration) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
       RETURNING *`,
      [
        titre, 
        contenu, 
        cible, 
        centre_id || null, 
        statut, 
        createdBy,
        date_publication || new Date().toISOString(),
        date_expiration || null
      ]
    );

    const annonce = annonceResult.rows[0];
    let userIds = [];
    let destinatairesInfo = '';

    // 2. Déterminer les destinataires selon la cible
    if (cible === 'TOUS') {
      // ✅ Tous les ÉTUDIANTS actifs
      const result = await db.query(`
        SELECT id FROM utilisateurs 
        WHERE role = 'ETUDIANT' 
          AND statut = 'ACTIF'
      `);
      userIds = result.rows.map(row => row.id);
      destinatairesInfo = `${userIds.length} étudiant(s) - Tous`;
      
    } else if (cible === 'CENTRE_SPECIFIQUE' && centre_id) {
      // ✅ Étudiants du centre avec attribution ACTIVE
      const result = await db.query(`
        SELECT DISTINCT u.id
        FROM utilisateurs u
        INNER JOIN attributions a ON u.id = a.utilisateur_id
        INNER JOIN logements l ON a.logement_id = l.id
        WHERE l.centre_id = $1
          AND u.role = 'ETUDIANT'
          AND u.statut = 'ACTIF'
          AND a.statut = 'ACTIVE'
      `, [centre_id]);
      userIds = result.rows.map(row => row.id);
      
      const centreResult = await db.query(
        'SELECT nom FROM centres WHERE id = $1', 
        [centre_id]
      );
      const centreNom = centreResult.rows[0]?.nom || `Centre ${centre_id}`;
      destinatairesInfo = `${userIds.length} étudiant(s) - Centre: ${centreNom}`;
      
    } else if (cible === 'ETUDIANTS' && user_ids && user_ids.length > 0) {
      // ✅ Étudiants spécifiques
      const placeholders = user_ids.map((_, i) => `$${i + 1}`).join(',');
      const result = await db.query(`
        SELECT id FROM utilisateurs 
        WHERE id IN (${placeholders}) 
          AND statut = 'ACTIF'
          AND role = 'ETUDIANT'
      `, user_ids);
      userIds = result.rows.map(row => row.id);
      destinatairesInfo = `${userIds.length} étudiant(s) spécifique(s)`;
      
    } else if (cible === 'GESTIONNAIRES') {
      // Gestionnaires et admins
      const result = await db.query(`
        SELECT id FROM utilisateurs 
        WHERE statut = 'ACTIF'
          AND role IN ('ADMIN', 'GESTIONNAIRE')
      `);
      userIds = result.rows.map(row => row.id);
      destinatairesInfo = `${userIds.length} gestionnaire(s)`;
    }

    console.log(`📤 [ANNONCES] ${userIds.length} destinataires identifiés : ${destinatairesInfo}`);

    // 3. S'assurer que la table annonce_destinataires existe
    await db.query(`
      CREATE TABLE IF NOT EXISTS annonce_destinataires (
        id SERIAL PRIMARY KEY,
        annonce_id INTEGER NOT NULL REFERENCES annonces(id) ON DELETE CASCADE,
        utilisateur_id INTEGER NOT NULL REFERENCES utilisateurs(id),
        date_envoi TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        lu BOOLEAN DEFAULT FALSE,
        date_lecture TIMESTAMP,
        UNIQUE(annonce_id, utilisateur_id)
      )
    `);

    // 4. Enregistrer les destinataires
    if (userIds.length > 0) {
      const values = [];
      const params = [];
      let paramIndex = 1;

      for (const userId of userIds) {
        values.push(`($${paramIndex}, $${paramIndex + 1})`);
        params.push(annonce.id, userId);
        paramIndex += 2;
      }

      await db.query(`
        INSERT INTO annonce_destinataires (annonce_id, utilisateur_id)
        VALUES ${values.join(', ')}
        ON CONFLICT (annonce_id, utilisateur_id) DO NOTHING
      `, params);
    }

    // 5. Envoyer les notifications EN ARRIÈRE-PLAN
if (statut === 'PUBLIE' && userIds.length > 0) {

  setImmediate(async () => {
    try {
      console.log(`📤 [ANNONCES] Envoi async de ${userIds.length} notifications...`);

      const notificationResult = await sendBulkNotificationsDirect(
        annonce.id,
        titre,
        contenu,
        cible,
        userIds,
        createdBy
      );

      console.log('📱 Notifications envoyées:', notificationResult);

    } catch (err) {
      console.error('❌ Erreur notifications async:', err);
    }
  });

}

    // 6. Journaliser l'activité
    await db.query(
      `INSERT INTO activites 
       (utilisateur_id, activity_type, title, description, metadata) 
       VALUES ($1, $2, $3, $4, $5)`,
      [
        createdBy,
        'ANNONCE_ENVOYEE',
        'Annonce envoyée',
        `Annonce "${titre}" envoyée (${destinatairesInfo})`,
        JSON.stringify({
          annonce_id: annonce.id,
          titre: titre,
          cible: cible,
          destinataires_count: userIds.length,
          statut: statut
        })
      ]
    );

    // 7. Récupérer les informations complètes pour la réponse
    const annonceComplete = await db.query(`
      SELECT 
        a.*,
        c.nom as centre_nom,
        u.nom as created_by_nom,
        u.prenom as created_by_prenom,
        COUNT(ad.id) as total_destinataires
      FROM annonces a
      LEFT JOIN centres c ON a.centre_id = c.id
      LEFT JOIN utilisateurs u ON a.created_by = u.id
      LEFT JOIN annonce_destinataires ad ON a.id = ad.annonce_id
      WHERE a.id = $1
      GROUP BY a.id, c.nom, u.nom, u.prenom
    `, [annonce.id]);

    console.log('✅ [ANNONCES] Annonce créée avec succès');

    res.json({
      success: true,
      message: 'Annonce créée avec succès',
      data: {
        annonce: annonceComplete.rows[0],
        destinataires: {
          count: userIds.length,
          info: destinatairesInfo
        }
      }
    });

  } catch (error) {
    console.error('❌ [ANNONCES] Erreur création annonce:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la création de l\'annonce',
      details: error.message 
    });
  }
};

const getAnnoncesAdmin = async (req, res) => {
  try {
    const { statut, cible } = req.query;
    
    let query = `
      SELECT 
        a.*,
        c.nom as centre_nom,
        u.nom as created_by_nom,
        u.prenom as created_by_prenom,
        COUNT(ad.id) as total_destinataires
      FROM annonces a
      LEFT JOIN centres c ON a.centre_id = c.id
      LEFT JOIN utilisateurs u ON a.created_by = u.id
      LEFT JOIN annonce_destinataires ad ON a.id = ad.annonce_id
    `;
    
    const params = [];
    const conditions = [];
    
    if (statut) {
      params.push(statut);
      conditions.push(`a.statut = $${params.length}`);
    }
    
    if (cible) {
      params.push(cible);
      conditions.push(`a.cible = $${params.length}`);
    }
    
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }
    
    query += ` GROUP BY a.id, c.nom, u.nom, u.prenom ORDER BY a.created_at DESC`;
    
    const result = await db.query(query, params);

    res.json({
      success: true,
      message: 'Liste des annonces',
      data: result.rows
    });
  } catch (error) {
    console.error('❌ [ANNONCES] Erreur récupération annonces:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la récupération des annonces',
      details: error.message 
    });
  }
};

const updateAnnonceStatut = async (req, res) => {
  try {
    const { annonceId } = req.params;
    const { statut } = req.body;
    
    // ✅ CORRECTION : PUBLIE au lieu de PUBLIEE
    if (!['PUBLIE', 'BROUILLON', 'ARCHIVE'].includes(statut)) {
      return res.status(400).json({ 
        error: 'Statut invalide. Valeurs acceptées: PUBLIE, BROUILLON, ARCHIVE' 
      });
    }

    const result = await db.query(
      `UPDATE annonces 
       SET statut = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 
       RETURNING *`,
      [statut, annonceId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Annonce non trouvée' });
    }

    // ✅ CORRECTION : PUBLIE au lieu de PUBLIEE
    if (statut === 'PUBLIE') {
      const annonce = result.rows[0];
      
      // Récupérer les destinataires
      const destinatairesResult = await db.query(
        `SELECT utilisateur_id FROM annonce_destinataires WHERE annonce_id = $1`,
        [annonceId]
      );
      
      const userIds = destinatairesResult.rows.map(row => row.utilisateur_id);
      
      if (userIds.length > 0) {
        await sendBulkNotificationsDirect(
          annonce.id,
          annonce.titre,
          annonce.contenu,
          annonce.cible,
          userIds,
          annonce.created_by
        );
      }
    }

    res.json({
      success: true,
      message: `Annonce ${statut.toLowerCase()} avec succès`,
      annonce: result.rows[0]
    });

  } catch (error) {
    console.error('❌ [ANNONCES] Erreur mise à jour statut:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la mise à jour du statut',
      details: error.message 
    });
  }
};

const deleteAnnonce = async (req, res) => {
  try {
    const { annonceId } = req.params;

    const result = await db.query(
      'DELETE FROM annonces WHERE id = $1 RETURNING *',
      [annonceId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Annonce non trouvée' });
    }

    res.json({
      success: true,
      message: 'Annonce supprimée avec succès'
    });

  } catch (error) {
    console.error('❌ [ANNONCES] Erreur suppression annonce:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la suppression de l\'annonce',
      details: error.message 
    });
  }
};

const getAnnoncesEtudiant = async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 50, offset = 0 } = req.query;

    console.log('📥 [ANNONCES] Récupération annonces pour étudiant ID:', userId);

    const queryText = `
      SELECT 
        a.*,
        c.nom as centre_nom,
        u.nom as created_by_nom,
        u.prenom as created_by_prenom,
        ad.lu,
        ad.date_lecture
      FROM annonces a
      LEFT JOIN centres c ON a.centre_id = c.id
      LEFT JOIN utilisateurs u ON a.created_by = u.id
      LEFT JOIN annonce_destinataires ad ON a.id = ad.annonce_id AND ad.utilisateur_id = $1
      WHERE a.statut = 'PUBLIE'
      AND (
        a.cible = 'TOUS'
        OR (a.cible = 'CENTRE_SPECIFIQUE' AND EXISTS (
          SELECT 1 FROM attributions att 
          JOIN logements l ON att.logement_id = l.id
          WHERE att.utilisateur_id = $1
          AND l.centre_id = a.centre_id
          AND att.statut = 'ACTIVE'
        ))
        OR (a.cible = 'ETUDIANTS' AND ad.utilisateur_id = $1)
      )
      AND (a.date_expiration IS NULL OR a.date_expiration > CURRENT_TIMESTAMP)
      AND (a.date_publication IS NULL OR a.date_publication <= CURRENT_TIMESTAMP)
      ORDER BY a.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await db.query(queryText, [userId, limit, offset]);

    console.log(`✅ [ANNONCES] ${result.rows.length} annonces trouvées pour l'étudiant ${userId}`);

    // Compter les annonces non lues
    const unreadQuery = `
      SELECT COUNT(*) 
      FROM annonce_destinataires ad
      JOIN annonces a ON ad.annonce_id = a.id
      WHERE ad.utilisateur_id = $1
      AND ad.lu = FALSE
      AND a.statut = 'PUBLIE'
      AND (a.date_expiration IS NULL OR a.date_expiration > CURRENT_TIMESTAMP)
    `;

    const unreadResult = await db.query(unreadQuery, [userId]);

    res.json({
      success: true,
      message: 'Annonces récupérées',
      data: result.rows,
      unread_count: parseInt(unreadResult.rows[0].count)
    });

  } catch (error) {
    console.error('❌ [ANNONCES] Erreur récupération annonces étudiant:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la récupération des annonces',
      details: error.message 
    });
  }
};

const getAnnonceById = async (req, res) => {
  try {
    const { annonceId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    console.log(`📥 [ANNONCES] Récupération annonce ID ${annonceId} pour utilisateur ${userId} (${userRole})`);

    const annonceResult = await db.query(`
      SELECT 
        a.*,
        c.nom as centre_nom,
        u.nom as created_by_nom,
        u.prenom as created_by_prenom,
        ad.lu,
        ad.date_lecture,
        COUNT(DISTINCT ad2.utilisateur_id) as total_destinataires
      FROM annonces a
      LEFT JOIN centres c ON a.centre_id = c.id
      LEFT JOIN utilisateurs u ON a.created_by = u.id
      LEFT JOIN annonce_destinataires ad ON a.id = ad.annonce_id AND ad.utilisateur_id = $1
      LEFT JOIN annonce_destinataires ad2 ON a.id = ad2.annonce_id
      WHERE a.id = $2
      GROUP BY a.id, c.nom, u.nom, u.prenom, ad.lu, ad.date_lecture
    `, [userId, annonceId]);

    if (annonceResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Annonce non trouvée' 
      });
    }

    const annonce = annonceResult.rows[0];

    // Vérifier les permissions pour les étudiants
    if (userRole === 'ETUDIANT') {
      const hasAccess = await checkAnnonceAccess(userId, annonceId);
      
      if (!hasAccess) {
        return res.status(403).json({ 
          error: 'Vous n\'avez pas accès à cette annonce' 
        });
      }
    }

    console.log(`✅ [ANNONCES] Annonce ${annonceId} récupérée avec succès`);

    res.json({
      success: true,
      message: 'Annonce récupérée',
      annonce: annonce
    });

  } catch (error) {
    console.error('❌ [ANNONCES] Erreur récupération annonce:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la récupération de l\'annonce',
      details: error.message 
    });
  }
};

// Fonction helper pour vérifier l'accès à une annonce
const checkAnnonceAccess = async (userId, annonceId) => {
  try {
    const result = await db.query(`
      SELECT 1
      FROM annonces a
      LEFT JOIN annonce_destinataires ad ON a.id = ad.annonce_id
      WHERE a.id = $1
      AND a.statut = 'PUBLIE'
      AND (
        a.cible = 'TOUS'
        OR (a.cible = 'CENTRE_SPECIFIQUE' AND EXISTS (
          SELECT 1 FROM attributions att 
          JOIN logements l ON att.logement_id = l.id
          WHERE att.utilisateur_id = $2
          AND l.centre_id = a.centre_id
          AND att.statut = 'ACTIVE'
        ))
        OR (a.cible = 'ETUDIANTS' AND ad.utilisateur_id = $2)
      )
      AND (a.date_expiration IS NULL OR a.date_expiration > CURRENT_TIMESTAMP)
      LIMIT 1
    `, [annonceId, userId]);

    return result.rows.length > 0;
  } catch (error) {
    console.error('❌ [ANNONCES] Erreur vérification accès annonce:', error);
    return false;
  }
};

module.exports = {
  sendAnnonce,
  getAnnoncesAdmin,
  getAnnoncesEtudiant,
  updateAnnonceStatut,
  deleteAnnonce,
  getAnnonceById,
};