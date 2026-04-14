const express = require('express');
const router = express.Router();
const signalementController = require('../controllers/signalementController');
const { authenticateToken, authorizeRoles } = require('../middlewares/authMiddleware');
const { uploadSignalementPhotos } = require('../middlewares/uploadMiddleware');
const { body, param, query, validationResult } = require('express-validator');
const db = require('../config/database');

// Middleware de validation pour créer un signalement
const creerSignalementValidation = [
  body('type_probleme')
    .notEmpty().withMessage('Le type de problème est requis')
    .isIn(['PLOMBERIE', 'ELECTRICITE', 'TOITURE', 'SERRURE', 'MOBILIER', 'AUTRE'])
    .withMessage('Type de problème invalide'),
  
  body('description')
    .notEmpty().withMessage('La description est requise')
    .isLength({ min: 10 }).withMessage('La description doit contenir au moins 10 caractères')
    .isLength({ max: 1000 }).withMessage('La description ne doit pas dépasser 1000 caractères'),
];

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Erreur de validation',
      details: errors.array(),
    });
  }
  next();
};


/**
 * @route   POST /api/signalements
 * @desc    Créer un nouveau signalement avec photos
 * @access  Private (Étudiant)
 */
router.post(
  '/',
  authenticateToken,
  authorizeRoles('ETUDIANT'),
  uploadSignalementPhotos,
  creerSignalementValidation,
  validate,
  signalementController.creerSignalement
);

/**
 * @route   GET /api/signalements
 * @desc    Récupérer l'historique des signalements de l'utilisateur
 * @access  Private (Étudiant)
 */
router.get(
  '/',
  authenticateToken,
  authorizeRoles('ETUDIANT'),
  signalementController.getSignalements
);

/**
 * @route   GET /api/signalements/:id
 * @desc    Récupérer les détails d'un signalement
 * @access  Private (Étudiant)
 */
router.get(
  '/:id',
  authenticateToken,
  authorizeRoles('ETUDIANT'),
  signalementController.getSignalementById
);

/**
 * @route   GET /api/signalements/:id/photos/:photoIndex
 * @desc    Récupérer une photo d'un signalement
 * @access  Private (Étudiant)
 */
router.get(
  '/:id/photos/:photoIndex',
  authenticateToken,
  authorizeRoles('ETUDIANT'),
  signalementController.getSignalementPhoto
);

module.exports = router;
// ==================== ROUTES ADMIN SIGNALEMENTS ====================

/**
 * @route   GET /api/signalements/admin/statistics
 * @desc    Récupérer les statistiques des signalements (admin) avec filtres
 * @access  Private (Admin, Gestionnaire)
 */
router.get(
  '/admin/statistics',
  authenticateToken,
  authorizeRoles('ADMIN', 'GESTIONNAIRE'),
  async (req, res) => {
    try {
      console.log('📊 Calcul des statistiques des signalements...');
      
      // Récupérer les filtres depuis la query string
      const {
        statut,
        type,
        centre_id,
        date_from,
        date_to,
        search
      } = req.query;

      // ============ CONSTRUCTION DE LA CLAUSE WHERE ============
      let whereClause = 'WHERE 1=1';
      const params = [];
      let paramIndex = 1;

      if (type && type !== 'TOUS') {
        whereClause += ` AND type_probleme = $${paramIndex}`;
        params.push(type);
        paramIndex++;
      }

      if (statut && statut !== 'TOUS') {
        whereClause += ` AND statut = $${paramIndex}`;
        params.push(statut);
        paramIndex++;
      }

      if (centre_id) {
        whereClause += ` AND nom_centre ILIKE $${paramIndex}`;
        params.push(`%${centre_id}%`);
        paramIndex++;
      }

      if (date_from) {
        whereClause += ` AND DATE(created_at) >= $${paramIndex}`;
        params.push(date_from);
        paramIndex++;
      }

      if (date_to) {
        whereClause += ` AND DATE(created_at) <= $${paramIndex}`;
        params.push(date_to);
        paramIndex++;
      }

      if (search && search.trim() !== '') {
        const searchTerm = `%${search}%`;
        whereClause += ` AND (
          description ILIKE $${paramIndex} OR
          numero_suivi ILIKE $${paramIndex}
        )`;
        params.push(searchTerm);
        paramIndex++;
      }

      console.log(`📊 Clause WHERE: ${whereClause}`);
      console.log(`📊 Paramètres: ${JSON.stringify(params)}`);

      // ============ REQUÊTE AVEC FILTRES ============
      const query = `
        SELECT
          COUNT(*) as total,
          
          -- Par statut
          COUNT(CASE WHEN statut = 'EN_ATTENTE' THEN 1 END) as en_attente,
          COUNT(CASE WHEN statut = 'EN_COURS' THEN 1 END) as en_cours,
          COUNT(CASE WHEN statut = 'RESOLU' THEN 1 END) as resolus,
          COUNT(CASE WHEN statut = 'ANNULE' THEN 1 END) as annules,
          
          -- Par type
          COUNT(CASE WHEN type_probleme = 'PLOMBERIE' THEN 1 END) as plomberie,
          COUNT(CASE WHEN type_probleme = 'ELECTRICITE' THEN 1 END) as electricite,
          COUNT(CASE WHEN type_probleme = 'MOBILIER' THEN 1 END) as mobilier,
          COUNT(CASE WHEN type_probleme = 'TOITURE' THEN 1 END) as toiture,
          COUNT(CASE WHEN type_probleme = 'SERRURE' THEN 1 END) as serrure,
          COUNT(CASE WHEN type_probleme = 'AUTRE' THEN 1 END) as autre,
          
          -- TAUX DE RÉSOLUTION (hors annulés)
          CASE 
            WHEN COUNT(*) - COUNT(CASE WHEN statut = 'ANNULE' THEN 1 END) > 0
            THEN ROUND(
              (COUNT(CASE WHEN statut = 'RESOLU' THEN 1 END) * 100.0) /
              (COUNT(*) - COUNT(CASE WHEN statut = 'ANNULE' THEN 1 END)),
              1
            )
            ELSE 0 
          END as taux_resolution
          
        FROM signalements
        ${whereClause}
      `;

      const stats = await db.query(query, params);

      const data = stats.rows[0];
      
      // Calcul manuel pour vérification
      const total = parseInt(data.total) || 0;
      const annules = parseInt(data.annules) || 0;
      const resolus = parseInt(data.resolus) || 0;
      const totalHorsAnnules = total - annules;
      const tauxVerif = totalHorsAnnules > 0 
        ? ((resolus * 100.0) / totalHorsAnnules).toFixed(1)
        : '0.0';
      
      console.log('📊 Statistiques calculées avec filtres:');
      console.log(`  - Total signalements: ${total}`);
      console.log(`  - Annulés: ${annules}`);
      console.log(`  - Total hors annulés: ${totalHorsAnnules}`);
      console.log(`  - Résolus: ${resolus}`);
      console.log(`  - Taux résolution: ${data.taux_resolution}%`);
      
      res.json({
        success: true,
        data: data,
      });

    } catch (error) {
      console.error('❌ Erreur récupération statistiques signalements:', error);
      console.error('❌ Détails de l\'erreur:', error.message);
      console.error('❌ Stack trace:', error.stack);
      res.status(500).json({
        success: false,
        error: 'Erreur lors de la récupération des statistiques',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @route   GET /api/signalements/admin/teams
 * @desc    Récupérer la liste des équipes techniques (admin)
 * @access  Private (Admin, Gestionnaire)
 */
router.get(
  '/admin/teams',
  authenticateToken,
  authorizeRoles('ADMIN', 'GESTIONNAIRE'),
  async (req, res) => {
    try {
      const teams = await db.query(`
        SELECT 
          id,
          nom,
          description,
          specialite,
          chef_equipe,
          telephone,
          email,
          statut,
          created_at,
          COUNT(s.id) as signalements_en_cours
        FROM equipes_techniques et
        LEFT JOIN signalements s ON et.id = s.equipe_id AND s.statut = 'EN_COURS'
        WHERE et.statut = 'ACTIVE'
        GROUP BY et.id
        ORDER BY nom
      `);

      res.json({
        success: true,
        data: teams.rows
      });

    } catch (error) {
      console.error('❌ Erreur récupération équipes:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur lors de la récupération des équipes'
      });
    }
  }
);

/**
 * @route   GET /api/signalements/admin/all
 * @desc    Récupérer tous les signalements (pour gestionnaires)
 * @access  Private (Gestionnaire, Admin)
 */
router.get(
  '/admin/all',
  authenticateToken,
  authorizeRoles('GESTIONNAIRE', 'ADMIN'),
  signalementController.getAllSignalements
);

/**
 * @route   GET /api/signalements/admin/:id
 * @desc    Récupérer un signalement spécifique pour admin
 * @access  Private (Gestionnaire, Admin)
 */
router.get(
  '/admin/:id',
  authenticateToken,
  authorizeRoles('GESTIONNAIRE', 'ADMIN'),
  signalementController.getSignalementAdminById
);

/**
 * @route   PUT /api/signalements/admin/:id/statut
 * @desc    Mettre à jour le statut d'un signalement
 * @access  Private (Gestionnaire, Admin)
 */
router.put(
  '/admin/:id/statut',
  authenticateToken,
  authorizeRoles('GESTIONNAIRE', 'ADMIN'),
  [
    body('statut')
      .notEmpty().withMessage('Le statut est requis')
      .isIn(['EN_ATTENTE', 'EN_COURS', 'RESOLU', 'ANNULE'])
      .withMessage('Statut invalide'),
    
    body('commentaire_resolution')
      .optional()
      .trim()
      .isLength({ min: 1 }).withMessage('Le commentaire ne peut pas être vide'),
  ],
  validate,
  signalementController.updateSignalementStatut
);

/**
 * @route   POST /api/signalements/admin/:id/assign
 * @desc    Affecter une équipe à un signalement (admin)
 * @access  Private (Admin, Gestionnaire)
 */
router.post(
  '/admin/:id/assign',
  authenticateToken,
  authorizeRoles('ADMIN', 'GESTIONNAIRE'),
  [
    param('id')
      .isInt()
      .withMessage('L\'ID du signalement doit être un nombre entier'),
    body('equipe_id')
      .isInt()
      .withMessage('L\'ID de l\'équipe doit être un nombre entier'),
    body('commentaire')
      .optional()
      .trim()
      .isLength({ min: 5, max: 500 })
      .withMessage('Le commentaire doit contenir entre 5 et 500 caractères')
  ],
  validate,
  async (req, res) => {
    const client = await db.getClient();
    
    try {
      const signalementId = req.params.id;
      const { equipe_id, commentaire } = req.body;
      const assignePar = req.user.id;

      // Vérifier que le signalement existe et est en attente
      const signalementResult = await client.query(`
        SELECT id, statut, attribution_id
        FROM signalements 
        WHERE id = $1 AND statut = 'EN_ATTENTE'
      `, [signalementId]);

      if (signalementResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Signalement non trouvé ou déjà pris en charge'
        });
      }

      // Vérifier que l'équipe existe
      const equipeResult = await client.query(
        'SELECT id, nom FROM equipes_techniques WHERE id = $1 AND statut = \'ACTIVE\'',
        [equipe_id]
      );

      if (equipeResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Équipe technique non trouvée'
        });
      }

      await client.query('BEGIN');

      // Mettre à jour le signalement
      const updateResult = await client.query(`
        UPDATE signalements 
        SET 
          statut = 'EN_COURS',
          equipe_id = $1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING id, statut, numero_suivi
      `, [equipe_id, signalementId]);

      // Enregistrer l'historique
      await client.query(`
        INSERT INTO signalement_historique (
          signalement_id, action, details, effectue_par
        )
        VALUES ($1, 'AFFECTATION', $2, $3)
      `, [
        signalementId,
        JSON.stringify({
          equipe_id,
          equipe_nom: equipeResult.rows[0].nom,
          commentaire,
          assigne_par: assignePar
        }),
        assignePar
      ]);

      await client.query('COMMIT');

      // Envoyer notification à l'étudiant
      if (isFirebaseAvailable()) {
        try {
          const userResult = await client.query(`
            SELECT u.id, u.nom, u.prenom
            FROM signalements s
            JOIN attributions a ON s.attribution_id = a.id
            JOIN utilisateurs u ON a.utilisateur_id = u.id
            WHERE s.id = $1
          `, [signalementId]);

          if (userResult.rows.length > 0) {
            const user = userResult.rows[0];
            
            await firebaseDb.collection('notifications').add({
              userId: user.id,
              type: 'SIGNALEMENT',
              title: 'Signalement pris en charge',
              message: 'Une équipe technique a été affectée à votre signalement',
              data: {
                signalement_id: signalementId,
                equipe_id: equipe_id
              },
              read: false,
              createdAt: new Date().toISOString()
            });
          }
        } catch (notifError) {
          console.error('⚠️ Erreur notification signalement:', notifError);
        }
      }

      res.json({
        success: true,
        data: updateResult.rows[0],
        message: 'Équipe affectée avec succès'
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Erreur affectation équipe:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur lors de l\'affectation de l\'équipe'
      });
    } finally {
      client.release();
    }
  }
);

