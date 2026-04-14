const db = require('../config/database');
const { db: firebaseDb, isFirebaseAvailable } = require('../config/firebase');
const { deleteFiles } = require('../utils/imageProcessor');
const path = require('path');
const crypto = require('crypto');

/**
 * Créer un nouveau signalement
 * POST /api/signalements
 */
const creerSignalement = async (req, res) => {
  const client = await db.getClient();

  try {
    const userId = req.user.id;
    const { type_probleme, description } = req.body;
    const photos = req.files || [];

    // Vérifier que l'utilisateur a une attribution active
    const attributionResult = await client.query(
      `SELECT a.id, l.numero_chambre, c.nom as nom_centre
       FROM attributions a
       JOIN logements l ON a.logement_id = l.id
       JOIN centres c ON l.centre_id = c.id
       WHERE a.utilisateur_id = $1 AND a.statut = 'ACTIVE'
       LIMIT 1`,
      [userId]
    );

    if (attributionResult.rows.length === 0) {
      // Supprimer les photos uploadées
      if (photos.length > 0) {
        deleteFiles(photos.map(f => f.path));
      }

      return res.status(400).json({
        error: 'Aucune attribution active trouvée',
      });
    }

    const attribution = attributionResult.rows[0];

    // Générer un numéro de suivi unique
    const numeroSuivi = `#${Date.now()}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

    await client.query('BEGIN');

    // Compresser les photos si nécessaire
const { uploadImage } = require('../config/cloudinary');

let photoPaths = [];
if (photos.length > 0) {
  console.log(`📸 Upload de ${photos.length} photo(s) vers Cloudinary...`);
  for (const photo of photos) {
    try {
      const url = await uploadImage(photo.path, 'cenou/signalements');
      photoPaths.push(url);
      console.log(`✅ Photo uploadée: ${url}`);
    } catch (err) {
      console.error(`❌ Erreur upload photo: ${err.message}`);
    }
  }
  deleteFiles(photos.map(f => f.path));

    // Créer le signalement
    const user = req.user; // ← injecté par authenticateToken

    const result = await client.query(
      `INSERT INTO signalements 
      (attribution_id, type_probleme, description, photos, numero_suivi, statut, user_id, numero_chambre, nom_centre) 
       VALUES ($1, $2, $3, $4, $5, 'EN_ATTENTE', $6, $7, $8) 
      RETURNING id, numero_suivi, type_probleme, description, statut, created_at`,
      [
        attribution.id,       
        type_probleme,
        description,
        photoPaths,
        numeroSuivi,
        user.id,              
        user.numero_chambre, 
        user.nom_centre       
      ]
    );

    const signalement = result.rows[0];

    await client.query('COMMIT');

    // Envoyer une notification au gestionnaire si Firebase disponible
    if (isFirebaseAvailable()) {
      try {
        await firebaseDb.collection('notifications').add({
          userId: 'GESTIONNAIRE', // À adapter selon votre logique
          title: `Nouveau signalement ${numeroSuivi}`,
          message: `${type_probleme} - Chambre ${attribution.numero_chambre}`,
          type: 'SIGNALEMENT',
          data: {
            signalement_id: signalement.id,
            numero_suivi: numeroSuivi,
            type_probleme: type_probleme,
            chambre: attribution.numero_chambre,
          },
          read: false,
          createdAt: new Date().toISOString(),
        });
        console.log('✅ Notification gestionnaire envoyée');
      } catch (notifError) {
        console.error('⚠️ Erreur notification Firebase:', notifError.message);
      }
    }

    res.status(201).json({
  message: 'Signalement créé avec succès',
  signalement: {
    id: signalement.id,
    numero_suivi: signalement.numero_suivi,
    type_probleme: signalement.type_probleme,
    description: signalement.description,
    statut: signalement.statut,
    photos: photoPaths, // ← renvoie la liste des photos
    photos_count: photoPaths.length,
    created_at: signalement.created_at,
    updated_at: signalement.updated_at || new Date().toISOString(), // ← renvoie updated_at
    numero_chambre: user.numero_chambre, // ← renvoie chambre
    nom_centre: user.nom_centre,         // ← renvoie centre
    commentaire_resolution: null,
    date_resolution: null,
  },
});}
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erreur lors de la création du signalement:', error);

    // Supprimer les photos uploadées en cas d'erreur
    if (req.files && req.files.length > 0) {
      deleteFiles(req.files.map(f => f.path));
    }

    res.status(500).json({
      error: 'Erreur lors de la création du signalement',
      details: error.message,
    });
  } finally {
    client.release();
  }
};

/**
 * Récupérer l'historique des signalements de l'utilisateur
 * GET /api/signalements
 */
const getSignalements = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await db.query(
      `SELECT s.id, s.numero_suivi, s.type_probleme, s.description, 
              s.photos, s.statut, s.date_resolution, s.commentaire_resolution,
              s.created_at, s.updated_at,
              l.numero_chambre, c.nom as nom_centre
       FROM signalements s
       JOIN attributions a ON s.attribution_id = a.id
       JOIN logements l ON a.logement_id = l.id
       JOIN centres c ON l.centre_id = c.id
       WHERE a.utilisateur_id = $1
       ORDER BY s.created_at DESC`,
      [userId]
    );

    res.json({
      signalements: result.rows.map(s => ({
        ...s,
        photos_count: s.photos ? s.photos.length : 0,
      })),
      total: result.rows.length,
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des signalements:', error);
    res.status(500).json({
      error: 'Erreur lors de la récupération des signalements',
      details: error.message,
    });
  }
};

/**
 * Récupérer les détails d'un signalement spécifique
 * GET /api/signalements/:id
 */
const getSignalementById = async (req, res) => {
  try {
    const userId = req.user.id;
    const signalementId = req.params.id;

    const result = await db.query(
      `SELECT s.id, s.numero_suivi, s.type_probleme, s.description, 
              s.photos, s.statut, s.date_resolution, s.commentaire_resolution,
              s.created_at, s.updated_at,
              l.numero_chambre, l.type_chambre,
              c.nom as nom_centre, c.ville,
              u.nom, u.prenom, u.matricule
       FROM signalements s
       JOIN attributions a ON s.attribution_id = a.id
       JOIN logements l ON a.logement_id = l.id
       JOIN centres c ON l.centre_id = c.id
       JOIN utilisateurs u ON a.utilisateur_id = u.id
       WHERE s.id = $1 AND a.utilisateur_id = $2`,
      [signalementId, userId]
    );
    //si les chemins retournés sont corrects
console.log('📸 Photos retournées:', result.rows[0].photos);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Signalement introuvable ou accès non autorisé',
      });
    }

    res.json({
      signalement: result.rows[0],
    });
  } catch (error) {
    console.error('Erreur lors de la récupération du signalement:', error);
    res.status(500).json({
      error: 'Erreur lors de la récupération du signalement',
      details: error.message,
    });
  }
};

/**
 * Récupérer une photo d'un signalement
 * GET /api/signalements/:id/photos/:photoIndex
 */
const getSignalementPhoto = async (req, res) => {
  try {
    const userId = req.user.id;
    const signalementId = req.params.id;
    const photoIndex = parseInt(req.params.photoIndex);

    // Vérifier que l'utilisateur a accès à ce signalement
    const result = await db.query(
      `SELECT s.photos
       FROM signalements s
       JOIN attributions a ON s.attribution_id = a.id
       WHERE s.id = $1 AND a.utilisateur_id = $2`,
      [signalementId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Signalement introuvable ou accès non autorisé',
      });
    }

    const photos = result.rows[0].photos;

    if (!photos || photoIndex < 0 || photoIndex >= photos.length) {
      return res.status(404).json({
        error: 'Photo introuvable',
      });
    }

    const photoPath = photos[photoIndex];

    // Vérifier que le fichier existe
    const fs = require('fs');
    if (!fs.existsSync(photoPath)) {
      return res.status(404).json({
        error: 'Fichier photo introuvable sur le serveur',
      });
    }

    // Envoyer la photo
    const absolutePath = path.join(__dirname, "..", photoPath);
  res.sendFile(absolutePath);

  } catch (error) {
    console.error('Erreur lors de la récupération de la photo:', error);
    res.status(500).json({
      error: 'Erreur lors de la récupération de la photo',
      details: error.message,
    });
  }
};

/**
 * Récupérer tous les signalements (pour gestionnaires)
 * GET /api/signalements/admin/all
 */
const getAllSignalements = async (req, res) => {
  try {
    const { 
      type,           // Filtre par type de problème
      statut,         // Filtre par statut
      centre_id,      // Filtre par centre
      date_from,      // Filtre date de début
      date_to,        // Filtre date de fin
      search,         // Recherche texte
      page = 1,       // Pagination
      limit = 20      // Limite par page
    } = req.query;

    console.log('🔍 PARAMÈTRES REÇUS (backend signalements):', {
      type, statut, centre_id, date_from, date_to, search, page, limit
    });

    // ============ CONSTRUCTION DE LA REQUÊTE ============
    let query = `
      SELECT 
        s.id,
        s.numero_suivi,
        s.type_probleme,
        s.description,
        s.photos,
        s.statut,
        s.date_resolution,
        s.commentaire_resolution,
        s.created_at,
        s.updated_at,
        s.attribution_id,
        l.numero_chambre,
        l.type_chambre,
        c.nom as nom_centre,
        c.ville,
        c.id as centre_id,
        u.nom,
        u.prenom,
        u.matricule,
        u.telephone,
        u.email
      FROM signalements s
      LEFT JOIN attributions a ON s.attribution_id = a.id
      LEFT JOIN utilisateurs u ON a.utilisateur_id = u.id
      LEFT JOIN logements l ON a.logement_id = l.id
      LEFT JOIN centres c ON l.centre_id = c.id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    // ============ FILTRE TYPE ============
    if (type && type !== 'TOUS') {
      query += ` AND s.type_probleme = $${paramIndex}`;
      params.push(type);
      paramIndex++;
      console.log(`✅ Filtre type appliqué: ${type}`);
    }

    // ============ FILTRE STATUT ============
    if (statut && statut !== 'TOUS') {
      query += ` AND s.statut = $${paramIndex}`;
      params.push(statut);
      paramIndex++;
      console.log(`✅ Filtre statut appliqué: ${statut}`);
    }

    // ============ FILTRE CENTRE ============
    if (centre_id) {
      query += ` AND s.nom_centre ILIKE $${paramIndex}`;
      params.push(`%${centre_id}%`); // Recherche par nom
      paramIndex++;
      console.log(`✅ Filtre centre appliqué: ${centre_id}`);
    }

    // ============ FILTRE DATE DEBUT ============
    if (date_from) {
      query += ` AND DATE(s.created_at) >= $${paramIndex}`;
      params.push(date_from);
      paramIndex++;
      console.log(`✅ Filtre date_from appliqué: ${date_from}`);
    }

    // ============ FILTRE DATE FIN ============
    if (date_to) {
      query += ` AND DATE(s.created_at) <= $${paramIndex}`;
      params.push(date_to);
      paramIndex++;
      console.log(`✅ Filtre date_to appliqué: ${date_to}`);
    }

    // ============ RECHERCHE TEXTUELLE ============
    if (search && search.trim() !== '') {
      const searchTerm = `%${search}%`;
      query += ` AND (
        s.description ILIKE $${paramIndex} OR
        s.numero_suivi ILIKE $${paramIndex} OR
        u.nom ILIKE $${paramIndex} OR
        u.prenom ILIKE $${paramIndex} OR
        u.matricule ILIKE $${paramIndex} OR
        u.telephone ILIKE $${paramIndex} OR
        u.email ILIKE $${paramIndex} OR
        s.nom_centre ILIKE $${paramIndex}
      )`;
      params.push(searchTerm);
      paramIndex++;
      console.log(`✅ Recherche appliquée: "${search}"`);
    }

    // ============ TRI ============
    query += ` ORDER BY s.created_at DESC`;

    // ============ PAGINATION ============
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // COUNT avec les bons JOINs
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM signalements s
      LEFT JOIN attributions a ON s.attribution_id = a.id
      LEFT JOIN utilisateurs u ON a.utilisateur_id = u.id
      LEFT JOIN logements l ON a.logement_id = l.id
      LEFT JOIN centres c ON l.centre_id = c.id
      WHERE 1=1 ${params.length > 0 ? query.split('WHERE 1=1')[1].split('ORDER BY')[0] : ''}
    `;
    const countParams = [...params];

    console.log(`📊 Count query: ${countQuery}`);
    console.log(`📊 Count params: ${JSON.stringify(countParams)}`);

    const countResult = await db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    // ============ APPLIQUER LA PAGINATION ============
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), offset);
    
    console.log(`📊 Page ${page}, Limit ${limit}, Offset ${offset}`);
    console.log(`📊 Query finale: ${query}`);
    console.log(`📊 Params: ${JSON.stringify(params)}`);

    // ============ EXÉCUTER LA REQUÊTE ============
    const result = await db.query(query, params);

    console.log(`📊 Résultats: ${result.rows.length} signalements trouvés sur ${total} total`);

    // ============ FORMATER LA RÉPONSE ============
    const formattedSignalements = result.rows.map(s => ({
      id: s.id,
      numero_suivi: s.numero_suivi,
      type_probleme: s.type_probleme,
      description: s.description,
      photos: s.photos || [],
      statut: s.statut,
      date_resolution: s.date_resolution,
      commentaire_resolution: s.commentaire_resolution,
      created_at: s.created_at,
      updated_at: s.updated_at,
      
      // Informations étudiant
      etudiant_nom_complet: `${s.nom || ''} ${s.prenom || ''}`.trim() || 'Non spécifié',
      matricule: s.matricule,
      telephone: s.telephone,
      email: s.email,
      
      // Informations centre (déjà dans la table signalements)
      nom_centre: s.nom_centre,
      ville: s.ville || 'Non spécifiée',
      
      // Chambre (déjà dans la table signalements)
      numero_chambre: s.numero_chambre,
      
      // Pour la compatibilité avec l'ancien code
      type_chambre: 'Standard', // Valeur par défaut ou à récupérer d'ailleurs
      
      // Métadonnées
      photos_count: Array.isArray(s.photos) ? s.photos.length : 0,
    }));

    res.json({
      success: true,
      signalements: formattedSignalements,
      total: total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit),
      filters_applied: {
        type: type || null,
        statut: statut || null,
        centre_id: centre_id || null,
        date_from: date_from || null,
        date_to: date_to || null,
        search: search || null
      }
    });

  } catch (error) {
    console.error('❌ Erreur dans getAllSignalements:', error);
    console.error('❌ Stack trace:', error.stack);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la récupération des signalements',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Mettre à jour le statut d'un signalement (pour gestionnaires)
 * PUT /api/signalements/admin/:id/statut
 */
const updateSignalementStatut = async (req, res) => {
  const client = await db.getClient();

  try {
    const signalementId = req.params.id;
    const { statut, commentaire_resolution } = req.body;

    // Vérifier que le signalement existe
    const checkResult = await client.query(
      `SELECT s.id, s.statut, s.user_id, s.numero_suivi,
              u.nom, u.prenom, u.matricule, u.telephone, u.email,
              s.numero_chambre, s.nom_centre, s.photos
       FROM signalements s
       LEFT JOIN utilisateurs u ON s.user_id = u.id
       WHERE s.id = $1`,
      [signalementId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Signalement introuvable',
      });
    }

    const signalement = checkResult.rows[0];

    await client.query('BEGIN');

    // Mettre à jour le statut
    const updateFields = ['statut = $1', 'updated_at = CURRENT_TIMESTAMP'];
    const updateParams = [statut];
    let paramIndex = 2;

    if ((statut === 'RESOLU' || statut === 'ANNULE') && commentaire_resolution) {
      updateFields.push(`commentaire_resolution = $${paramIndex}`);
      updateParams.push(commentaire_resolution);
      paramIndex++;
    }

    if (statut === 'RESOLU') {
      updateFields.push(`date_resolution = CURRENT_TIMESTAMP`);
    }

    updateParams.push(signalementId);

    const result = await client.query(
      `UPDATE signalements 
       SET ${updateFields.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING 
         id, numero_suivi, type_probleme, description, photos, statut, 
         date_resolution, commentaire_resolution, created_at, updated_at,
         numero_chambre, nom_centre, user_id`,
      updateParams
    );

    await client.query('COMMIT');

    // Récupérer les informations de l'utilisateur mis à jour
    const userResult = await client.query(
      `SELECT nom, prenom, matricule, telephone, email
       FROM utilisateurs
       WHERE id = $1`,
      [signalement.user_id]
    );

    const userInfo = userResult.rows[0] || {};

    // CORRECTION ICI : Inclure nom et prenom explicitement
    const updatedSignalement = {
      ...result.rows[0],
      // Informations étudiant - RÉCUPÉRER DE LA BASE
      nom: userInfo.nom || signalement.nom, // <-- AJOUTER ICI
      prenom: userInfo.prenom || signalement.prenom, // <-- AJOUTER ICI
      etudiant_nom_complet: userInfo.nom && userInfo.prenom 
        ? `${userInfo.nom} ${userInfo.prenom}`.trim()
        : (signalement.nom && signalement.prenom 
          ? `${signalement.nom} ${signalement.prenom}`.trim()
          : 'Non spécifié'),
      matricule: userInfo.matricule || signalement.matricule,
      telephone: userInfo.telephone || signalement.telephone,
      email: userInfo.email || signalement.email,
      
      // Informations complémentaires
      photos_count: result.rows[0].photos ? result.rows[0].photos.length : 0,
    };

    // Envoyer une notification à l'étudiant si Firebase disponible
    if (isFirebaseAvailable() && signalement.user_id) {
      try {
        let notificationTitle = 'Mise à jour signalement';
        let notificationMessage = '';

        if (statut === 'EN_COURS') {
          notificationTitle = 'Signalement pris en charge 🔧';
          notificationMessage = 'Votre signalement est en cours de traitement.';
        } else if (statut === 'RESOLU') {
          notificationTitle = 'Signalement résolu ✅';
          notificationMessage = 'Votre problème a été résolu.';
        }

        await firebaseDb.collection('notifications').add({
          userId: signalement.user_id,
          title: notificationTitle,
          message: notificationMessage,
          type: 'SIGNALEMENT',
          data: {
            signalement_id: signalementId,
            numero_suivi: result.rows[0].numero_suivi,
            statut: statut,
          },
          read: false,
          createdAt: new Date().toISOString(),
        });
        console.log('✅ Notification étudiant envoyée');
      } catch (notifError) {
        console.error('⚠️ Erreur notification Firebase:', notifError.message);
      }
    }

    res.json({
      message: 'Statut du signalement mis à jour avec succès',
      data: updatedSignalement, // <-- IMPORTANT: retourner dans "data"
      success: true,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erreur lors de la mise à jour du statut:', error);
    res.status(500).json({
      error: 'Erreur lors de la mise à jour du statut',
      details: error.message,
    });
  } finally {
    client.release();
  }
};

/**
 * Récupérer un signalement spécifique pour admin
 * GET /api/signalements/admin/:id
 */
const getSignalementAdminById = async (req, res) => {
  try {
    const signalementId = req.params.id;

    const result = await db.query(
      `SELECT 
         s.id, s.numero_suivi, s.type_probleme, s.description, 
         s.photos, s.statut, s.date_resolution, s.commentaire_resolution,
         s.created_at, s.updated_at,
         s.numero_chambre, s.nom_centre, s.user_id,
         
         -- Informations étudiant
         u.nom, u.prenom, u.matricule, u.telephone, u.email,
         
         -- Informations centre
         c.ville
       FROM signalements s
       LEFT JOIN utilisateurs u ON s.user_id = u.id
       LEFT JOIN centres c ON s.nom_centre = c.nom
       WHERE s.id = $1`,
      [signalementId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Signalement introuvable',
      });
    }

    const signalement = result.rows[0];

    const formattedSignalement = {
      id: signalement.id,
      numero_suivi: signalement.numero_suivi,
      type_probleme: signalement.type_probleme,
      description: signalement.description,
      photos: signalement.photos || [],
      statut: signalement.statut,
      date_resolution: signalement.date_resolution,
      commentaire_resolution: signalement.commentaire_resolution,
      created_at: signalement.created_at,
      updated_at: signalement.updated_at,
      
      // Informations étudiant
      etudiant_nom_complet: signalement.nom && signalement.prenom 
        ? `${signalement.nom} ${signalement.prenom}`.trim()
        : 'Non spécifié',
      matricule: signalement.matricule,
      telephone: signalement.telephone,
      email: signalement.email,
      
      // Informations centre
      nom_centre: signalement.nom_centre,
      ville: signalement.ville || 'Non spécifiée',
      
      // Chambre
      numero_chambre: signalement.numero_chambre,
      
      // Métadonnées
      photos_count: Array.isArray(signalement.photos) ? signalement.photos.length : 0,
    };

    res.json({
      success: true,
      signalement: formattedSignalement,
    });
  } catch (error) {
    console.error('Erreur lors de la récupération du signalement:', error);
    res.status(500).json({
      error: 'Erreur lors de la récupération du signalement',
      details: error.message,
    });
  }
};

module.exports = {
  creerSignalement,
  getSignalements,
  getSignalementById,
  getSignalementPhoto,
  getAllSignalements,
  getSignalementAdminById,
  updateSignalementStatut,
};
