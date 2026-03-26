const db = require('../config/database');
const { hashPassword, comparePassword } = require('../utils/hash');

/**
 * Récupérer le profil complet de l'utilisateur connecté
 * GET /api/users/profile
 */
const getProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    // Récupérer les informations de l'utilisateur
    const userResult = await db.query(
      `SELECT u.id, u.matricule, u.nom, u.prenom, u.email, u.telephone, 
              u.role, u.statut, u.created_at
       FROM utilisateurs u
       WHERE u.id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Utilisateur introuvable',
      });
    }

    const user = userResult.rows[0];

    // Si l'utilisateur est étudiant, récupérer son attribution de logement
    let attribution = null;
    if (user.role === 'ETUDIANT') {
      const attributionResult = await db.query(
        `SELECT a.id, a.date_debut, a.date_fin, a.statut as statut_attribution,
                l.numero_chambre, l.type_chambre, l.prix_mensuel, l.statut as statut_logement,
                c.nom as nom_centre, c.ville
         FROM attributions a
         JOIN logements l ON a.logement_id = l.id
         JOIN centres c ON l.centre_id = c.id
         WHERE a.utilisateur_id = $1 AND a.statut = 'ACTIVE'
         ORDER BY a.date_debut DESC
         LIMIT 1`,
        [userId]
      );

      if (attributionResult.rows.length > 0) {
        attribution = attributionResult.rows[0];
      }
    }

    res.json({
      user: user,
      attribution: attribution,
    });
  } catch (error) {
    console.error('Erreur lors de la récupération du profil:', error);
    res.status(500).json({
      error: 'Erreur lors de la récupération du profil',
      details: error.message,
    });
  }
};

/**
 * Mettre à jour les informations du profil
 * PUT /api/users/profile
 */
const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { email, telephone } = req.body;

    // Vérifier si l'email est déjà utilisé par un autre utilisateur
    if (email) {
      const existingEmail = await db.query(
        'SELECT id FROM utilisateurs WHERE email = $1 AND id != $2',
        [email, userId]
      );

      if (existingEmail.rows.length > 0) {
        return res.status(409).json({
          error: 'Cet email est déjà utilisé par un autre utilisateur',
        });
      }
    }

    // Construire la requête de mise à jour dynamiquement
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (email) {
      updates.push(`email = $${paramIndex}`);
      values.push(email);
      paramIndex++;
    }

    if (telephone) {
      updates.push(`telephone = $${paramIndex}`);
      values.push(telephone);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({
        error: 'Aucune modification fournie',
      });
    }

    // Ajouter l'ID utilisateur pour le WHERE
    values.push(userId);

    // Exécuter la mise à jour
    const result = await db.query(
      `UPDATE utilisateurs 
       SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${paramIndex}
       RETURNING id, matricule, nom, prenom, email, telephone, role, statut`,
      values
    );

    res.json({
      message: 'Profil mis à jour avec succès',
      user: result.rows[0],
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour du profil:', error);
    res.status(500).json({
      error: 'Erreur lors de la mise à jour du profil',
      details: error.message,
    });
  }
};

/**
 * Changer le mot de passe
 * PUT /api/users/change-password
 */
const changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { ancien_mot_de_passe, nouveau_mot_de_passe } = req.body;

    // Récupérer le mot de passe actuel de l'utilisateur
    const result = await db.query(
      'SELECT mot_de_passe FROM utilisateurs WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Utilisateur introuvable',
      });
    }

    const currentHashedPassword = result.rows[0].mot_de_passe;

    // Vérifier l'ancien mot de passe
    const isPasswordValid = await comparePassword(ancien_mot_de_passe, currentHashedPassword);

    if (!isPasswordValid) {
      return res.status(401).json({
        error: 'L\'ancien mot de passe est incorrect',
      });
    }

    // Vérifier que le nouveau mot de passe est différent de l'ancien
    const isSamePassword = await comparePassword(nouveau_mot_de_passe, currentHashedPassword);
    if (isSamePassword) {
      return res.status(400).json({
        error: 'Le nouveau mot de passe doit être différent de l\'ancien',
      });
    }

    // Hacher le nouveau mot de passe
    const newHashedPassword = await hashPassword(nouveau_mot_de_passe);

    // Mettre à jour le mot de passe
    await db.query(
      'UPDATE utilisateurs SET mot_de_passe = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newHashedPassword, userId]
    );

    res.json({
      message: 'Mot de passe changé avec succès',
    });
  } catch (error) {
    console.error('Erreur lors du changement de mot de passe:', error);
    res.status(500).json({
      error: 'Erreur lors du changement de mot de passe',
      details: error.message,
    });
  }
};

/**
 * Récupérer l'historique des attributions (pour étudiants)
 * GET /api/users/attributions
 */
const getAttributionsHistory = async (req, res) => {
  try {
    const userId = req.user.id;

    // Vérifier que l'utilisateur est un étudiant
    if (req.user.role !== 'ETUDIANT') {
      return res.status(403).json({
        error: 'Cette fonctionnalité est réservée aux étudiants',
      });
    }

    // Récupérer l'historique des attributions
    const result = await db.query(
      `SELECT a.id, a.date_debut, a.date_fin, a.statut,
              l.numero_chambre, l.type_chambre, l.prix_mensuel,
              c.nom as nom_centre, c.ville,
              a.created_at
       FROM attributions a
       JOIN logements l ON a.logement_id = l.id
       JOIN centres c ON l.centre_id = c.id
       WHERE a.utilisateur_id = $1
       ORDER BY a.date_debut DESC`,
      [userId]
    );

    res.json({
      attributions: result.rows,
      total: result.rows.length,
    });
  } catch (error) {
    console.error('Erreur lors de la récupération de l\'historique:', error);
    res.status(500).json({
      error: 'Erreur lors de la récupération de l\'historique',
      details: error.message,
    });
  }
};

/**
 * Récupérer les statistiques de l'utilisateur (pour étudiants)
 * GET /api/users/stats
 */
const getUserStats = async (req, res) => {
  try {
    const userId = req.user.id;

    // Vérifier que l'utilisateur est un étudiant
    if (req.user.role !== 'ETUDIANT') {
      return res.status(403).json({
        error: 'Cette fonctionnalité est réservée aux étudiants',
      });
    }

    // Récupérer les statistiques
    const statsResult = await db.query(
      `SELECT 
         COUNT(DISTINCT a.id) as total_attributions,
         COUNT(DISTINCT p.id) as total_paiements,
         COALESCE(SUM(CASE WHEN p.statut = 'CONFIRME' THEN p.montant ELSE 0 END), 0) as montant_total_paye,
         COUNT(DISTINCT CASE WHEN p.statut = 'EN_ATTENTE' THEN p.id END) as paiements_en_attente,
         COUNT(DISTINCT s.id) as total_signalements,
         COUNT(DISTINCT CASE WHEN s.statut = 'RESOLU' THEN s.id END) as signalements_resolus
       FROM utilisateurs u
       LEFT JOIN attributions a ON u.id = a.utilisateur_id
       LEFT JOIN paiements p ON a.id = p.attribution_id
       LEFT JOIN signalements s ON a.id = s.attribution_id
       WHERE u.id = $1`,
      [userId]
    );

    res.json({
      stats: statsResult.rows[0],
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des statistiques:', error);
    res.status(500).json({
      error: 'Erreur lors de la récupération des statistiques',
      details: error.message,
    });
  }
};

/**
 * Désactiver son propre compte (soft delete)
 * DELETE /api/users/account
 */
const deactivateAccount = async (req, res) => {
  try {
    const userId = req.user.id;
    const { mot_de_passe } = req.body;

    // Vérifier le mot de passe avant désactivation
    const result = await db.query(
      'SELECT mot_de_passe FROM utilisateurs WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Utilisateur introuvable',
      });
    }

    const hashedPassword = result.rows[0].mot_de_passe;
    const isPasswordValid = await comparePassword(mot_de_passe, hashedPassword);

    if (!isPasswordValid) {
      return res.status(401).json({
        error: 'Mot de passe incorrect',
      });
    }

    // Désactiver le compte
    await db.query(
      'UPDATE utilisateurs SET statut = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['INACTIF', userId]
    );

    res.json({
      message: 'Compte désactivé avec succès',
    });
  } catch (error) {
    console.error('Erreur lors de la désactivation du compte:', error);
    res.status(500).json({
      error: 'Erreur lors de la désactivation du compte',
      details: error.message,
    });
  }
};

/**
 * Mettre à jour le statut d'un utilisateur (ADMIN uniquement)
 * PUT /api/users/admin/:id/statut
 */
const updateUserStatus = async (req, res) => {
  try {
    // Vérifier que l'utilisateur est admin
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({
        error: 'Accès refusé. Réservé aux administrateurs.',
      });
    }

    const { id } = req.params;
    const { statut } = req.body;

    console.log(`🔧 Mise à jour statut utilisateur ${id} → ${statut}`);

    // Valider le statut
    const validStatuts = ['ACTIF', 'INACTIF', 'SUSPENDU'];
    if (!validStatuts.includes(statut)) {
      return res.status(400).json({
        error: 'Statut invalide. Valeurs acceptées: ACTIF, INACTIF, SUSPENDU',
      });
    }

    // Vérifier que l'utilisateur existe
    const checkUser = await db.query(
      'SELECT id, nom, prenom, role FROM utilisateurs WHERE id = $1',
      [id]
    );

    if (checkUser.rows.length === 0) {
      return res.status(404).json({
        error: 'Utilisateur introuvable',
      });
    }

    const user = checkUser.rows[0];

    // Mettre à jour le statut
    const result = await db.query(
      `UPDATE utilisateurs 
       SET statut = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 
       RETURNING id, matricule, nom, prenom, email, role, statut, updated_at`,
      [statut, id]
    );

    console.log(`✅ Statut utilisateur ${id} mis à jour: ${statut}`);

    res.json({
      success: true,
      message: 'Statut mis à jour avec succès',
      data: {
        user: result.rows[0],
      },
    });
  } catch (error) {
    console.error('❌ Erreur updateUserStatus:', error);
    res.status(500).json({
      error: 'Erreur lors de la mise à jour du statut',
      details: error.message,
    });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  changePassword,
  getAttributionsHistory,
  getUserStats,
  deactivateAccount,
  updateUserStatus,
};