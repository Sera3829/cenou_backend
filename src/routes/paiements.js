const express = require('express');
const router = express.Router();
const paiementController = require('../controllers/paiementController');
const { authenticateToken, authorizeRoles } = require('../middlewares/authMiddleware');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');

// Middleware de validation pour initier un paiement
const initierPaiementValidation = [
  body('montant')
    .notEmpty().withMessage('Le montant est requis')
    .isFloat({ min: 0 }).withMessage('Le montant doit être un nombre positif'),
  
  body('mode_paiement')
    .notEmpty().withMessage('Le mode de paiement est requis')
    .isIn(['ORANGE_MONEY', 'MOOV_MONEY']).withMessage('Mode de paiement invalide'),
  
  body('numero_telephone')
    .notEmpty().withMessage('Le numéro de téléphone est requis')
    .matches(/^\+?[0-9]{8,15}$/).withMessage('Numéro de téléphone invalide'),
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
 * @route   GET /api/paiements
 * @desc    Récupérer l'historique des paiements
 * @access  Private (Étudiant)
 */
router.get(
  '/',
  authenticateToken,
  authorizeRoles('ETUDIANT'),
  paiementController.getPaiements
);

/**
 * @route   GET /api/paiements/pending
 * @desc    Récupérer les paiements en attente
 * @access  Private (Étudiant)
 */
router.get(
  '/pending',
  authenticateToken,
  authorizeRoles('ETUDIANT'),
  paiementController.getPendingPaiements
);

/**
 * @route   GET /api/paiements/loyer
 * @desc    Récupérer le loyer mensuel de l'étudiant connecté
 * @access  Private (Étudiant)
 */
router.get(
  '/loyer',
  authenticateToken,
  authorizeRoles('ETUDIANT'),
  async (req, res) => {
    try {
      const userId = req.user.id;

      const result = await db.query(
        `SELECT 
           l.prix_mensuel,
           l.numero_chambre,
           l.type_chambre,
           c.nom as nom_centre,
           a.date_debut
         FROM attributions a
         JOIN logements l ON a.logement_id = l.id
         JOIN centres c ON l.centre_id = c.id
         WHERE a.utilisateur_id = $1 
           AND a.statut = 'ACTIVE'
         LIMIT 1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'Aucune attribution active trouvée',
        });
      }

      res.json({
        success: true,
        data: result.rows[0],
      });
    } catch (error) {
      console.error('Erreur récupération loyer:', error);
      res.status(500).json({
        error: 'Erreur lors de la récupération du loyer',
        details: error.message,
      });
    }
  }
);

/**
 * @route   GET /api/paiements/:id
 * @desc    Récupérer les détails d'un paiement
 * @access  Private (Étudiant)
 */
router.get(
  '/:id',
  authenticateToken,
  authorizeRoles('ETUDIANT'),
  paiementController.getPaiementById
);

/**
 * @route   POST /api/paiements/initier
 * @desc    Initier un paiement mobile money
 * @access  Private (Étudiant)
 */
router.post(
  '/initier',
  authenticateToken,
  authorizeRoles('ETUDIANT'),
  initierPaiementValidation,
  validate,
  paiementController.initierPaiement
);

/**
 * @route   POST /api/paiements/callback
 * @desc    Callback de confirmation de paiement (Orange Money / Moov Money)
 * @access  Public (appelé par les opérateurs)
 */
router.post('/callback', paiementController.callbackPaiement);

// ==================== ROUTE ADMIN ====================

const { query } = require('express-validator');

// Middleware de validation pour routes admin
const adminPaiementsValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Le numéro de page doit être supérieur à 0'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('La limite doit être entre 1 et 100'),
  
  query('statut')
    .optional()
    .isIn(['EN_ATTENTE', 'CONFIRME', 'ECHEC', 'TOUS'])
    .withMessage('Le statut doit être: EN_ATTENTE, CONFIRME, ECHEC ou TOUS'),
  
  query('mode_paiement')
    .optional()
    .isIn(['ORANGE_MONEY', 'MOOV_MONEY', 'ESPECES', 'VIREMENT', 'TOUS'])
    .withMessage('Le mode de paiement doit être: ORANGE_MONEY, MOOV_MONEY, ESPECES, VIREMENT ou TOUS'),
  
  query('date_from')
    .optional()
    .isISO8601()
    .withMessage('La date de début doit être au format ISO 8601'),
  
  query('date_to')
    .optional()
    .isISO8601()
    .withMessage('La date de fin doit être au format ISO 8601'),
  
  query('centre_id')
    .optional()
    .isInt()
    .withMessage('L\'ID du centre doit être un nombre entier'),
  
  query('search')
    .optional()
    .trim()
    .isLength({ min: 2 })
    .withMessage('La recherche doit contenir au moins 2 caractères')
];

/**
 * @route   GET /api/paiements/admin/statistics
 * @desc    Récupérer les statistiques des paiements (admin) avec filtres
 * @access  Private (Admin, Gestionnaire)
 */
router.get(
  '/admin/statistics',
  authenticateToken,
  authorizeRoles('ADMIN', 'GESTIONNAIRE'),
  async (req, res) => {
    try {
      const db = require('../config/database');
      
      // Récupérer les filtres depuis la query string
      const {
        statut,
        mode_paiement,
        date_from,
        date_to,
        centre_id,
        search
      } = req.query;

      // Construire la clause WHERE pour les filtres
      let whereClause = 'WHERE 1=1';
      const params = [];
      let paramIndex = 1;

      if (statut && statut !== 'TOUS') {
        whereClause += ` AND p.statut = $${paramIndex}`;
        params.push(statut);
        paramIndex++;
      }

      if (mode_paiement && mode_paiement !== 'TOUS') {
        whereClause += ` AND p.mode_paiement = $${paramIndex}`;
        params.push(mode_paiement);
        paramIndex++;
      }

      if (date_from) {
        whereClause += ` AND DATE(p.date_paiement) >= $${paramIndex}`;
        params.push(date_from);
        paramIndex++;
      }

      if (date_to) {
        whereClause += ` AND DATE(p.date_paiement) <= $${paramIndex}`;
        params.push(date_to);
        paramIndex++;
      }

      if (centre_id) {
        whereClause += ` AND c.id = $${paramIndex}`;
        params.push(centre_id);
        paramIndex++;
      }

      if (search) {
        whereClause += ` AND (
          u.matricule ILIKE $${paramIndex} OR
          u.nom ILIKE $${paramIndex} OR
          u.prenom ILIKE $${paramIndex} OR
          u.email ILIKE $${paramIndex} OR
          l.numero_chambre ILIKE $${paramIndex} OR
          c.nom ILIKE $${paramIndex}
        )`;
        params.push(`%${search}%`);
        paramIndex++;
      }

      // Requête avec les filtres
      const query = `
        SELECT 
          -- Par statut
          (SELECT COUNT(*) FROM paiements p
           JOIN attributions a ON p.attribution_id = a.id
           JOIN logements l ON a.logement_id = l.id
           JOIN centres c ON l.centre_id = c.id
           JOIN utilisateurs u ON a.utilisateur_id = u.id
           ${whereClause} AND p.statut = 'CONFIRME') as confirmes,
          
          (SELECT COUNT(*) FROM paiements p
           JOIN attributions a ON p.attribution_id = a.id
           JOIN logements l ON a.logement_id = l.id
           JOIN centres c ON l.centre_id = c.id
           JOIN utilisateurs u ON a.utilisateur_id = u.id
           ${whereClause} AND p.statut = 'EN_ATTENTE') as en_attente,
          
          (SELECT COUNT(*) FROM paiements p
           JOIN attributions a ON p.attribution_id = a.id
           JOIN logements l ON a.logement_id = l.id
           JOIN centres c ON l.centre_id = c.id
           JOIN utilisateurs u ON a.utilisateur_id = u.id
           ${whereClause} AND p.statut = 'ECHEC') as echecs,
          
          -- Par mode
          (SELECT COUNT(*) FROM paiements p
           JOIN attributions a ON p.attribution_id = a.id
           JOIN logements l ON a.logement_id = l.id
           JOIN centres c ON l.centre_id = c.id
           JOIN utilisateurs u ON a.utilisateur_id = u.id
           ${whereClause} AND p.mode_paiement = 'ORANGE_MONEY') as orange_money,
          
          (SELECT COUNT(*) FROM paiements p
           JOIN attributions a ON p.attribution_id = a.id
           JOIN logements l ON a.logement_id = l.id
           JOIN centres c ON l.centre_id = c.id
           JOIN utilisateurs u ON a.utilisateur_id = u.id
           ${whereClause} AND p.mode_paiement = 'MOOV_MONEY') as moov_money,
          
          (SELECT COUNT(*) FROM paiements p
           JOIN attributions a ON p.attribution_id = a.id
           JOIN logements l ON a.logement_id = l.id
           JOIN centres c ON l.centre_id = c.id
           JOIN utilisateurs u ON a.utilisateur_id = u.id
           ${whereClause} AND p.mode_paiement = 'ESPECES') as especes,
          
          (SELECT COUNT(*) FROM paiements p
           JOIN attributions a ON p.attribution_id = a.id
           JOIN logements l ON a.logement_id = l.id
           JOIN centres c ON l.centre_id = c.id
           JOIN utilisateurs u ON a.utilisateur_id = u.id
           ${whereClause} AND p.mode_paiement = 'VIREMENT') as virement,
          
          -- Totaux
          (SELECT COALESCE(SUM(p.montant), 0) FROM paiements p
           JOIN attributions a ON p.attribution_id = a.id
           JOIN logements l ON a.logement_id = l.id
           JOIN centres c ON l.centre_id = c.id
           JOIN utilisateurs u ON a.utilisateur_id = u.id
           ${whereClause} AND p.statut = 'CONFIRME') as total_confirme,
          
          (SELECT COALESCE(SUM(p.montant), 0) FROM paiements p
           JOIN attributions a ON p.attribution_id = a.id
           JOIN logements l ON a.logement_id = l.id
           JOIN centres c ON l.centre_id = c.id
           JOIN utilisateurs u ON a.utilisateur_id = u.id
           ${whereClause} AND p.statut = 'EN_ATTENTE') as total_en_attente,
          
          (SELECT COALESCE(SUM(p.montant), 0) FROM paiements p
           JOIN attributions a ON p.attribution_id = a.id
           JOIN logements l ON a.logement_id = l.id
           JOIN centres c ON l.centre_id = c.id
           JOIN utilisateurs u ON a.utilisateur_id = u.id
           ${whereClause} AND p.statut = 'ECHEC') as total_echec,
          
          -- Total général (tous statuts confondus)
          (SELECT COUNT(*) FROM paiements p
           JOIN attributions a ON p.attribution_id = a.id
           JOIN logements l ON a.logement_id = l.id
           JOIN centres c ON l.centre_id = c.id
           JOIN utilisateurs u ON a.utilisateur_id = u.id
           ${whereClause}) as total
      `;

      // Exécuter la requête avec les paramètres
      const result = await db.query(query, params);

      res.json({
        success: true,
        data: result.rows[0]
      });

    } catch (error) {
      console.error('❌ Erreur récupération statistiques paiements:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur lors de la récupération des statistiques'
      });
    }
  }
);


/**
 * @route   GET /api/paiements/admin/all
 * @desc    Récupérer tous les paiements (admin)
 * @access  Private (Admin, Gestionnaire)
 */
router.get(
  '/admin/all',
  authenticateToken,
  authorizeRoles('ADMIN', 'GESTIONNAIRE'),
  adminPaiementsValidation,
  validate,
  async (req, res) => {
    try {
      const {
        page = 1,
        limit = 20,
        statut,
        mode_paiement,
        date_from,
        date_to,
        centre_id,
        search
      } = req.query;

      const offset = (page - 1) * limit;

      let query = `
        SELECT 
          p.id,
          p.montant,
          p.date_paiement,
          p.date_echeance,
          p.mode_paiement,
          p.reference_transaction,
          p.statut,
          p.created_at,
          p.updated_at,
          u.id as user_id,
          u.matricule,
          u.nom,
          u.prenom,
          u.email,
          u.telephone,
          l.numero_chambre,
          l.type_chambre,
          l.prix_mensuel,
          c.id as centre_id,
          c.nom as centre_nom,
          c.ville as centre_ville
        FROM paiements p
        JOIN attributions a ON p.attribution_id = a.id
        JOIN utilisateurs u ON a.utilisateur_id = u.id
        JOIN logements l ON a.logement_id = l.id
        JOIN centres c ON l.centre_id = c.id
        WHERE 1=1
      `;

      const params = [];
      let paramIndex = 1;

      if (statut && statut !== 'TOUS') {
        query += ` AND p.statut = $${paramIndex}`;
        params.push(statut);
        paramIndex++;
      }

      if (mode_paiement && mode_paiement !== 'TOUS') {
        query += ` AND p.mode_paiement = $${paramIndex}`;
        params.push(mode_paiement);
        paramIndex++;
      }

      if (date_from) {
        query += ` AND DATE(p.date_paiement) >= $${paramIndex}`;
        params.push(date_from);
        paramIndex++;
      }

      if (date_to) {
        query += ` AND DATE(p.date_paiement) <= $${paramIndex}`;
        params.push(date_to);
        paramIndex++;
      }

      if (centre_id) {
        query += ` AND c.id = $${paramIndex}`;
        params.push(centre_id);
        paramIndex++;
      }

      if (search) {
        query += ` AND (
          u.matricule ILIKE $${paramIndex} OR
          u.nom ILIKE $${paramIndex} OR
          u.prenom ILIKE $${paramIndex} OR
          u.email ILIKE $${paramIndex} OR
          l.numero_chambre ILIKE $${paramIndex} OR
          c.nom ILIKE $${paramIndex}
        )`;
        params.push(`%${search}%`);
        paramIndex++;
      }

      // Compter le total
      const countQuery = `SELECT COUNT(*) FROM (${query}) as subquery`;
      const countResult = await db.query(countQuery, params);
      const total = parseInt(countResult.rows[0].count);

      // Ajouter pagination et tri
      query += ` ORDER BY p.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);

      const result = await db.query(query, params);

      res.json({
        success: true,
        data: {
          paiements: result.rows,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
          }
        }
      });

    } catch (error) {
      console.error('❌ Erreur récupération paiements admin:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur lors de la récupération des paiements'
      });
    }
  }
);

/**
 * @route   GET /api/paiements/admin/:id
 * @desc    Récupérer les détails d'un paiement (admin)
 * @access  Private (Admin, Gestionnaire)
 */
router.get(
  '/admin/:id',
  authenticateToken,
  authorizeRoles('ADMIN', 'GESTIONNAIRE'),
  async (req, res) => {
    try {
      const paiementId = req.params.id;

      const result = await db.query(`
        SELECT 
          p.id,
          p.montant,
          p.date_paiement,
          p.date_echeance,
          p.mode_paiement,
          p.reference_transaction,
          p.statut,
          p.created_at,
          p.updated_at,
          u.id as user_id,
          u.matricule,
          u.nom,
          u.prenom,
          u.email,
          u.telephone,
          u.role,
          u.statut as user_statut,
          l.id as logement_id,
          l.numero_chambre,
          l.type_chambre,
          l.prix_mensuel,
          l.statut as logement_statut,
          c.id as centre_id,
          c.nom as centre_nom,
          c.ville,
          c.adresse,
          a.id as attribution_id,
          a.date_debut,
          a.date_fin,
          a.statut as attribution_statut
        FROM paiements p
        JOIN attributions a ON p.attribution_id = a.id
        JOIN utilisateurs u ON a.utilisateur_id = u.id
        JOIN logements l ON a.logement_id = l.id
        JOIN centres c ON l.centre_id = c.id
        WHERE p.id = $1
      `, [paiementId]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Paiement non trouvé'
        });
      }

      res.json({
        success: true,
        data: result.rows[0]
      });

    } catch (error) {
      console.error('❌ Erreur récupération détail paiement:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur lors de la récupération du paiement'
      });
    }
  }
);

/**
 * @route   PUT /api/paiements/admin/:id/statut
 * @desc    Mettre à jour le statut d'un paiement (admin)
 * @access  Private (Admin, Gestionnaire)
 */
router.put(
  '/admin/:id/statut',
  authenticateToken,
  authorizeRoles('ADMIN', 'GESTIONNAIRE'),
  [
    body('statut')
      .isIn(['CONFIRME', 'ECHEC', 'EN_ATTENTE'])
      .withMessage('Le statut doit être: CONFIRME, ECHEC ou EN_ATTENTE'),
    
    body('raison')
      .optional()
      .trim()
      .isLength({ min: 5, max: 500 })
      .withMessage('La raison doit contenir entre 5 et 500 caractères')
  ],
  validate,
  async (req, res) => {
    const db = require('../config/database');
    const { db: firebaseDb, isFirebaseAvailable } = require('../config/firebase');
    
    const client = await db.getClient();
    
    try {
      const paiementId = req.params.id;
      const { statut, raison } = req.body;
      const adminId = req.user.id;

      // Vérifier que le paiement existe
      const checkResult = await client.query(
        'SELECT id, statut, attribution_id FROM paiements WHERE id = $1',
        [paiementId]
      );

      if (checkResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Paiement non trouvé'
        });
      }

      const paiement = checkResult.rows[0];

      await client.query('BEGIN');

      // Mettre à jour le statut
      const updateResult = await client.query(`
        UPDATE paiements 
        SET statut = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING id, statut, date_paiement
      `, [statut, paiementId]);

      // Enregistrer l'historique
      await client.query(`
        INSERT INTO paiement_historique (paiement_id, ancien_statut, nouveau_statut, modifie_par, raison)
        VALUES ($1, $2, $3, $4, $5)
      `, [paiementId, paiement.statut, statut, adminId, raison || null]);

      // Si confirmé et pas encore de date, mettre à jour la date
      if (statut === 'CONFIRME') {
        await client.query(`
          UPDATE paiements 
          SET date_paiement = COALESCE(date_paiement, CURRENT_TIMESTAMP)
          WHERE id = $1
        `, [paiementId]);
      }

      await client.query('COMMIT');

      // Envoyer notification si Firebase disponible
      if (isFirebaseAvailable()) {
        try {
          // Récupérer l'utilisateur concerné
          const userResult = await client.query(`
            SELECT u.id, u.matricule, u.nom, u.prenom
            FROM attributions a
            JOIN utilisateurs u ON a.utilisateur_id = u.id
            WHERE a.id = $1
          `, [paiement.attribution_id]);

          if (userResult.rows.length > 0) {
            const user = userResult.rows[0];
            
            await firebaseDb.collection('notifications').add({
              userId: user.id,
              type: 'PAIEMENT',
              title: `Paiement ${statut === 'CONFIRME' ? 'confirmé' : 'mis à jour'}`,
              message: `Votre paiement a été ${statut === 'CONFIRME' ? 'confirmé' : 'mis à jour'}`,
              data: {
                paiement_id: paiementId,
                nouveau_statut: statut
              },
              read: false,
              createdAt: new Date().toISOString()
            });
          }
        } catch (notifError) {
          console.error('⚠️ Erreur notification paiement:', notifError);
        }
      }

      res.json({
        success: true,
        data: updateResult.rows[0],
        message: `Statut du paiement mis à jour: ${statut}`
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Erreur mise à jour statut paiement:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur lors de la mise à jour du statut'
      });
    } finally {
      client.release();
    }
  }
);

module.exports = router;