const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const db = require('../config/database');
const { authenticateToken, authorizeRoles, getCentreScope } = require('../middlewares/authMiddleware');
const {
  updateProfileValidation,
  changePasswordValidation,
  validate,
} = require('../utils/validators');
const { query, param, body } = require('express-validator');
//const db = require('../config/database');
const { hashPassword } = require('../utils/hash');

/**
 * @route   GET /api/users/profile
 * @desc    Récupérer le profil complet de l'utilisateur connecté
 * @access  Private
 */
router.get('/profile', authenticateToken, userController.getProfile);

/**
 * @route   PUT /api/users/profile
 * @desc    Mettre à jour les informations du profil
 * @access  Private
 */
router.put(
  '/profile',
  authenticateToken,
  updateProfileValidation,
  validate,
  userController.updateProfile
);

/**
 * @route   PUT /api/users/change-password
 * @desc    Changer le mot de passe
 * @access  Private
 */
router.put(
  '/change-password',
  authenticateToken,
  changePasswordValidation,
  validate,
  userController.changePassword
);

/**
 * @route   GET /api/users/attributions
 * @desc    Récupérer l'historique des attributions (étudiants uniquement)
 * @access  Private (Étudiant)
 */
router.get('/attributions', authenticateToken, userController.getAttributionsHistory);

/**
 * @route   GET /api/users/stats
 * @desc    Récupérer les statistiques de l'utilisateur (étudiants uniquement)
 * @access  Private (Étudiant)
 */
router.get('/stats', authenticateToken, userController.getUserStats);

/**
 * @route   DELETE /api/users/account
 * @desc    Désactiver son propre compte
 * @access  Private
 */
router.delete('/account', authenticateToken, userController.deactivateAccount);



// ==================== ROUTES ADMIN UTILISATEURS ====================

/**
 * @route   GET /api/users/admin/all
 * @desc    Récupérer tous les utilisateurs (admin) - VERSION SANS DOUBLONS GARANTIE
 * @access  Private (Admin, Gestionnaire)
 */
router.get(
  '/admin/all',
  authenticateToken,
  authorizeRoles('ADMIN', 'GESTIONNAIRE'),
  [
    query('role')
      .optional()
      .isIn(['ETUDIANT', 'GESTIONNAIRE', 'ADMIN', 'TOUS'])
      .withMessage('Le rôle doit être: ETUDIANT, GESTIONNAIRE, ADMIN ou TOUS'),
    query('statut')
      .optional()
      .isIn(['ACTIF', 'INACTIF', 'SUSPENDU', 'TOUS'])
      .withMessage('Le statut doit être: ACTIF, INACTIF, SUSPENDU ou TOUS'),
    query('centre_id')
      .optional()
      .isInt()
      .withMessage('L\'ID du centre doit être un nombre entier'),
    query('search')
      .optional()
      .trim()
      .isLength({ min: 2 })
      .withMessage('La recherche doit contenir au moins 2 caractères'),
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Le numéro de page doit être supérieur à 0'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 1000 })
      .withMessage('La limite doit être entre 1 et 1000')
  ],
  validate,
  async (req, res) => {
    try {
      const {
        role,
        statut,
        search,
        page = 1,
        limit = 20
      } = req.query;

      // 🔒 Cloisonnement : un gestionnaire ne voit que les utilisateurs
      // rattachés à son centre (via leur attribution active)
      const centreScope = getCentreScope(req);
      const centre_id = centreScope !== null ? centreScope : req.query.centre_id;

      const offset = (page - 1) * limit;

      console.log('📥 [GET /admin/all] Paramètres:', { role, statut, centre_id, search, page, limit });

      // ✅ ÉTAPE 1 : Récupérer d'abord les IDs des utilisateurs qui matchent les filtres (SANS JOIN)
      let userIdsQuery = `
        SELECT DISTINCT u.id
        FROM utilisateurs u
        WHERE 1=1
      `;

      const userIdsParams = [];
      let userIdsParamIndex = 1;

      // Filtres de base (pas besoin de JOIN)
      if (role && role !== 'TOUS') {
        userIdsQuery += ` AND u.role = $${userIdsParamIndex}`;
        userIdsParams.push(role);
        userIdsParamIndex++;
      }

      if (statut && statut !== 'TOUS') {
        userIdsQuery += ` AND u.statut = $${userIdsParamIndex}`;
        userIdsParams.push(statut);
        userIdsParamIndex++;
      }

      // Si filtre par centre_id ou search, on doit ajouter les JOIN
      if (centre_id || search) {
        userIdsQuery = `
          SELECT DISTINCT u.id
          FROM utilisateurs u
          LEFT JOIN attributions a ON u.id = a.utilisateur_id AND a.statut = 'ACTIVE'
          LEFT JOIN logements l ON a.logement_id = l.id
          LEFT JOIN centres c ON l.centre_id = c.id
          WHERE 1=1
        `;

        userIdsParams.length = 0;
        userIdsParamIndex = 1;

        if (role && role !== 'TOUS') {
          userIdsQuery += ` AND u.role = $${userIdsParamIndex}`;
          userIdsParams.push(role);
          userIdsParamIndex++;
        }

        if (statut && statut !== 'TOUS') {
          userIdsQuery += ` AND u.statut = $${userIdsParamIndex}`;
          userIdsParams.push(statut);
          userIdsParamIndex++;
        }

        if (centre_id) {
          userIdsQuery += ` AND c.id = $${userIdsParamIndex}`;
          userIdsParams.push(centre_id);
          userIdsParamIndex++;
        }

        if (search) {
          userIdsQuery += ` AND (
            u.matricule ILIKE $${userIdsParamIndex} OR
            u.nom ILIKE $${userIdsParamIndex} OR
            u.prenom ILIKE $${userIdsParamIndex} OR
            u.email ILIKE $${userIdsParamIndex} OR
            l.numero_chambre ILIKE $${userIdsParamIndex} OR
            c.nom ILIKE $${userIdsParamIndex}
          )`;
          userIdsParams.push(`%${search}%`);
          userIdsParamIndex++;
        }
      }

      console.log('📝 [Étape 1] Récupération des IDs utilisateurs...');

      // Récupérer tous les IDs qui matchent
      const userIdsResult = await db.query(userIdsQuery, userIdsParams);
      const allMatchingIds = userIdsResult.rows.map(row => row.id);
      const total = allMatchingIds.length;

      console.log(`✅ [Étape 1] ${total} utilisateurs matchent les filtres`);

      // Appliquer la pagination sur les IDs
      const paginatedIds = allMatchingIds.slice(offset, offset + parseInt(limit));

      console.log(`📝 [Étape 2] Récupération des détails pour ${paginatedIds.length} utilisateurs (page ${page})...`);

      // ✅ ÉTAPE 2 : Récupérer les détails UNIQUEMENT pour les IDs paginés
      if (paginatedIds.length === 0) {
        return res.json({
          success: true,
          data: {
            users: [],
            pagination: {
              page: parseInt(page),
              limit: parseInt(limit),
              total: 0,
              pages: 0
            }
          }
        });
      }

      const placeholders = paginatedIds.map((_, i) => `$${i + 1}`).join(',');

      const detailsQuery = `
        SELECT 
          u.id,
          u.matricule,
          u.nom,
          u.prenom,
          u.email,
          u.telephone,
          u.role,
          u.statut,
          u.created_at,
          u.updated_at,
          latest.centre_id,
          latest.centre_nom,
          latest.numero_chambre,
          latest.date_debut,
          latest.date_fin,
          latest.attribution_statut
        FROM utilisateurs u
        LEFT JOIN LATERAL (
          SELECT 
            c.id as centre_id,
            c.nom as centre_nom,
            l.numero_chambre,
            a.date_debut,
            a.date_fin,
            a.statut as attribution_statut
          FROM attributions a
          INNER JOIN logements l ON a.logement_id = l.id
          INNER JOIN centres c ON l.centre_id = c.id
          WHERE a.utilisateur_id = u.id 
            AND a.statut = 'ACTIVE'
          ORDER BY a.date_debut DESC
          LIMIT 1
        ) latest ON true
        WHERE u.id IN (${placeholders})
        ORDER BY u.created_at DESC
      `;

      const detailsResult = await db.query(detailsQuery, paginatedIds);

      console.log(`✅ [Étape 2] ${detailsResult.rows.length} utilisateurs récupérés avec détails`);

      // ✅ Vérification finale des doublons
      const uniqueIds = new Set(detailsResult.rows.map(u => u.id));
      if (uniqueIds.size !== detailsResult.rows.length) {
        console.error(`❌ DOUBLONS DÉTECTÉS: ${detailsResult.rows.length} lignes mais ${uniqueIds.size} IDs uniques`);
        
        // Identifier les doublons
        const idCounts = {};
        detailsResult.rows.forEach(u => {
          idCounts[u.id] = (idCounts[u.id] || 0) + 1;
        });
        const duplicates = Object.entries(idCounts).filter(([_, count]) => count > 1);
        console.error('❌ IDs en doublon:', duplicates.map(([id, count]) => `ID ${id}: ${count} fois`));
        
        // DÉDUPLICATION FORCÉE (au cas où)
        const uniqueUsers = [];
        const seenIds = new Set();
        for (const user of detailsResult.rows) {
          if (!seenIds.has(user.id)) {
            uniqueUsers.push(user);
            seenIds.add(user.id);
          }
        }
        
        console.log(`✅ Après déduplification: ${uniqueUsers.length} utilisateurs uniques`);
        
        return res.json({
          success: true,
          data: {
            users: uniqueUsers,
            pagination: {
              page: parseInt(page),
              limit: parseInt(limit),
              total,
              pages: Math.ceil(total / parseInt(limit))
            }
          },
          warning: 'Doublons détectés et corrigés automatiquement'
        });
      }

      console.log(`✅ Aucun doublon - Envoi de ${detailsResult.rows.length} utilisateurs`);

      res.json({
        success: true,
        data: {
          users: detailsResult.rows,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit))
          }
        }
      });

    } catch (error) {
      console.error('❌ [GET /admin/all] Erreur:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur lors de la récupération des utilisateurs',
        details: process.env.NODE_ENV !== 'production' ? error.message : undefined
      });
    }
  }
);

/**
 * @route   GET /api/users/admin/etudiants
 * @desc    Récupérer tous les étudiants (pour sélection dans annonces)
 * @access  Private (Admin/Gestionnaire)
 */
router.get('/admin/etudiants', 
  authenticateToken,
  authorizeRoles('ADMIN', 'GESTIONNAIRE'),
  async (req, res) => {
    try {
      // 🔒 Cloisonnement : un gestionnaire ne voit que les étudiants de son centre
      const centreScope = getCentreScope(req);
      const params = [];
      let centreClause = '';
      if (centreScope !== null) {
        centreClause = 'AND l.centre_id = $1';
        params.push(centreScope);
      }

      const result = await db.query(`
        SELECT DISTINCT ON (u.id)
          u.id,
          u.matricule,
          u.nom,
          u.prenom,
          u.email,
          u.statut,
          c.nom as centre_nom,
          l.numero_chambre
        FROM utilisateurs u
        LEFT JOIN attributions a ON u.id = a.utilisateur_id AND a.statut = 'ACTIVE'
        LEFT JOIN logements l ON a.logement_id = l.id
        LEFT JOIN centres c ON l.centre_id = c.id
        WHERE u.role = 'ETUDIANT'
          AND u.statut = 'ACTIF'
          ${centreClause}
        ORDER BY u.id, u.nom ASC, u.prenom ASC
      `, params);

      console.log(`✅ [USERS] ${result.rows.length} étudiants trouvés`);

      res.json({
        success: true,
        data: result.rows,
        count: result.rows.length
      });

    } catch (error) {
      console.error('❌ [USERS] Erreur récupération étudiants:', error);
      res.status(500).json({
        error: 'Erreur lors de la récupération des étudiants',
        details: process.env.NODE_ENV !== 'production' ? error.message : undefined
      });
    }
  }
);

/**
 * @route   PUT /api/users/admin/:id/statut
 * @desc    Mettre à jour le statut d'un utilisateur (admin)
 * @access  Private (Admin)
 */
router.put(
  '/admin/:id/statut',
  authenticateToken,
  authorizeRoles('ADMIN', 'GESTIONNAIRE'),
  [
    param('id')
      .isInt()
      .withMessage('L\'ID de l\'utilisateur doit être un nombre entier'),
    body('statut')
      .isIn(['ACTIF', 'INACTIF', 'SUSPENDU'])
      .withMessage('Le statut doit être: ACTIF, INACTIF ou SUSPENDU')
  ],
  validate,
  userController.updateUserStatus  // ✅ Utiliser la nouvelle fonction
);

/**
 * @route   GET /api/users/admin/:id
 * @desc    Récupérer les détails d'un utilisateur (admin)
 * @access  Private (Admin, Gestionnaire)
 */
router.get(
  '/admin/:id',
  authenticateToken,
  authorizeRoles('ADMIN', 'GESTIONNAIRE'),
  [
    param('id')
      .isInt()
      .withMessage('L\'ID de l\'utilisateur doit être un nombre entier')
  ],
  validate,
  async (req, res) => {
    try {
      const userId = req.params.id;

      // 🔒 Cloisonnement : un gestionnaire ne peut consulter que les
      // étudiants rattachés à son centre
      const centreScope = getCentreScope(req);
      const userParams = [userId];
      let centreClause = '';
      if (centreScope !== null) {
        centreClause = `AND u.role = 'ETUDIANT' AND EXISTS (
          SELECT 1 FROM attributions a2
          JOIN logements l2 ON a2.logement_id = l2.id
          WHERE a2.utilisateur_id = u.id
            AND a2.statut = 'ACTIVE'
            AND l2.centre_id = $2
        )`;
        userParams.push(centreScope);
      }

      // Détails utilisateur — colonnes explicites : ne JAMAIS renvoyer
      // u.* (le hash du mot de passe partait au client)
      const userResult = await db.query(`
        SELECT
          u.id, u.matricule, u.nom, u.prenom, u.email, u.telephone,
          u.role, u.statut, u.centre_id, u.created_at, u.updated_at,
          c.nom as centre_nom,
          l.numero_chambre,
          a.date_debut,
          a.date_fin,
          a.statut as attribution_statut
        FROM utilisateurs u
        LEFT JOIN attributions a ON u.id = a.utilisateur_id AND a.statut = 'ACTIVE'
        LEFT JOIN logements l ON a.logement_id = l.id
        LEFT JOIN centres c ON l.centre_id = c.id
        WHERE u.id = $1 ${centreClause}
      `, userParams);

      if (userResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Utilisateur non trouvé'
        });
      }

      const user = userResult.rows[0];

      // Historique des paiements
      const paiementsResult = await db.query(`
        SELECT 
          p.id,
          p.montant,
          p.date_paiement,
          p.date_echeance,
          p.mode_paiement,
          p.statut,
          p.created_at
        FROM paiements p
        JOIN attributions a ON p.attribution_id = a.id
        WHERE a.utilisateur_id = $1
        ORDER BY p.created_at DESC
        LIMIT 10
      `, [userId]);

      // Historique des signalements
      const signalementsResult = await db.query(`
        SELECT 
          s.id,
          s.numero_suivi,
          s.type_probleme,
          s.statut,
          s.created_at,
          s.date_resolution,
          l.numero_chambre
        FROM signalements s
        JOIN attributions a ON s.attribution_id = a.id
        JOIN logements l ON a.logement_id = l.id
        WHERE a.utilisateur_id = $1
        ORDER BY s.created_at DESC
        LIMIT 10
      `, [userId]);

      // Statistiques
      const statsResult = await db.query(`
        SELECT 
          COUNT(DISTINCT p.id) as total_paiements,
          COALESCE(SUM(CASE WHEN p.statut = 'CONFIRME' THEN p.montant ELSE 0 END), 0) as montant_total,
          COUNT(DISTINCT s.id) as total_signalements,
          COUNT(DISTINCT CASE WHEN s.statut = 'RESOLU' THEN s.id END) as signalements_resolus
        FROM utilisateurs u
        LEFT JOIN attributions a ON u.id = a.utilisateur_id
        LEFT JOIN paiements p ON a.id = p.attribution_id
        LEFT JOIN signalements s ON a.id = s.attribution_id
        WHERE u.id = $1
      `, [userId]);

      res.json({
        success: true,
        data: {
          user,
          paiements: paiementsResult.rows,
          signalements: signalementsResult.rows,
          statistics: statsResult.rows[0] || {}
        }
      });

    } catch (error) {
      console.error('❌ Erreur récupération détail utilisateur:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur lors de la récupération de l\'utilisateur'
      });
    }
  }
);

/**
 * @route   POST /api/users/admin/create
 * @desc    Créer un nouvel utilisateur (admin)
 * @access  Private (Admin)
 */
router.post(
  '/admin/create',
  authenticateToken,
  authorizeRoles('ADMIN', 'GESTIONNAIRE'),
  [
    body('matricule')
      .trim()
      .notEmpty()
      .withMessage('Le matricule est requis')
      .isLength({ min: 5, max: 50 })
      .withMessage('Le matricule doit contenir entre 5 et 50 caractères'),
    body('nom')
      .trim()
      .notEmpty()
      .withMessage('Le nom est requis')
      .isLength({ min: 2, max: 100 })
      .withMessage('Le nom doit contenir entre 2 et 100 caractères'),
    body('prenom')
      .trim()
      .notEmpty()
      .withMessage('Le prénom est requis')
      .isLength({ min: 2, max: 100 })
      .withMessage('Le prénom doit contenir entre 2 et 100 caractères'),
    body('email')
      .trim()
      .notEmpty()
      .withMessage('L\'email est requis')
      .isEmail()
      .withMessage('Email invalide')
      .normalizeEmail(),
    body('telephone')
      .optional()
      .trim()
      .matches(/^\+?[0-9]{8,20}$/)
      .withMessage('Numéro de téléphone invalide'),
    body('logement_id')
    .if(body('role').equals('ETUDIANT'))
    .notEmpty().withMessage('La chambre est obligatoire pour un étudiant')
    .isInt().withMessage('L\'ID du logement doit être un nombre entier'),
    body('statut')
      .optional()
      .isIn(['ACTIF', 'INACTIF', 'SUSPENDU'])
      .withMessage('Le statut doit être: ACTIF, INACTIF ou SUSPENDU'),
    body('mot_de_passe')
      .optional()
      .isLength({ min: 6 })
      .withMessage('Le mot de passe doit contenir au moins 6 caractères'),
    body('confirmation_mot_de_passe')
      .optional()
      .custom((value, { req }) => {
        if (req.body.mot_de_passe && value !== req.body.mot_de_passe) {
          throw new Error('Les mots de passe ne correspondent pas');
        }
        return true;
      }),
    body('centre_id')
      .optional()
      .isInt()
      .withMessage('L\'ID du centre doit être un nombre entier'),
    body('logement_id')
      .optional()
      .isInt()
      .withMessage('L\'ID du logement doit être un nombre entier'),
    body('date_debut')
      .optional()
      .isISO8601()
      .withMessage('La date de début doit être au format ISO 8601'),
    body('date_fin')
      .optional()
      .isISO8601()
      .withMessage('La date de fin doit être au format ISO 8601')
  ],
  validate,
  async (req, res) => {
    const client = await db.getClient();
    
    try {
      const {
        matricule,
        nom,
        prenom,
        email,
        telephone,
        role,
        statut = 'ACTIF',
        mot_de_passe,
        centre_id,
        logement_id,
        date_debut,
        date_fin
      } = req.body;

      const adminId = req.user.id;

      // 🔒 Un GESTIONNAIRE ne peut pas créer ADMIN ni GESTIONNAIRE
      if (req.user.role === 'GESTIONNAIRE' && ['ADMIN', 'GESTIONNAIRE'].includes(role)) {
        return res.status(403).json({
          success: false,
          error: 'Accès refusé. Un gestionnaire ne peut créer que des étudiants.',
        });
      }

      // 🔒 Cloisonnement : un gestionnaire ne peut attribuer que des
      // logements de son propre centre
      const centreScope = getCentreScope(req);
      if (centreScope !== null && logement_id) {
        const logementCheck = await client.query(
          'SELECT centre_id FROM logements WHERE id = $1',
          [logement_id]
        );
        if (logementCheck.rows.length === 0 ||
            logementCheck.rows[0].centre_id !== centreScope) {
          return res.status(403).json({
            success: false,
            error: 'Accès refusé. Ce logement n\'appartient pas à votre centre.',
          });
        }
      }

      // Le centre_id n'est stocké sur l'utilisateur que pour les GESTIONNAIRE
      // (pour un étudiant, le centre découle de son attribution/logement).
      // Sans ça, un gestionnaire créé via le dashboard avait centre_id NULL
      // et ne voyait aucune donnée (fail closed).
      let centreIdGestionnaire = null;
      if (role === 'GESTIONNAIRE') {
        if (!centre_id) {
          return res.status(400).json({
            success: false,
            error: 'Le centre est obligatoire pour un gestionnaire.',
          });
        }
        const centreCheck = await client.query('SELECT id FROM centres WHERE id = $1', [centre_id]);
        if (centreCheck.rows.length === 0) {
          return res.status(400).json({ success: false, error: 'Centre introuvable.' });
        }
        centreIdGestionnaire = centre_id;
      }

      // Vérifier si le matricule existe déjà
      const existingMatricule = await client.query(
        'SELECT id FROM utilisateurs WHERE matricule = $1',
        [matricule]
      );

      if (existingMatricule.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: 'Ce matricule est déjà utilisé'
        });
      }

      // Vérifier si l'email existe déjà
      const existingEmail = await client.query(
        'SELECT id FROM utilisateurs WHERE email = $1',
        [email]
      );

      if (existingEmail.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: 'Cet email est déjà utilisé'
        });
      }

      await client.query('BEGIN');

      // Générer un mot de passe par défaut si non fourni
      const passwordToUse = mot_de_passe || generateDefaultPassword();
      const hashedPassword = await hashPassword(passwordToUse);

      // Créer l'utilisateur
      const userResult = await client.query(`
        INSERT INTO utilisateurs (
          matricule, nom, prenom, email, telephone,
          mot_de_passe, role, statut, created_by, centre_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, matricule, nom, prenom, email, telephone, role, statut, centre_id, created_at
      `, [
        matricule, nom, prenom, email, telephone || null,
        hashedPassword, role, statut, adminId, centreIdGestionnaire
      ]);

      const newUser = userResult.rows[0];

      // Si c'est un étudiant avec attribution
      if (role === 'ETUDIANT' && logement_id && date_debut) {
        await client.query(`
          INSERT INTO attributions (
            utilisateur_id, logement_id, date_debut, date_fin, statut
          )
          VALUES ($1, $2, $3, $4, 'ACTIVE')
        `, [
          newUser.id,
          logement_id,
          date_debut,
          date_fin || null
        ]);

        // Marquer le logement comme occupé
        await client.query(`
          UPDATE logements 
          SET statut = 'OCCUPE'
          WHERE id = $1
        `, [logement_id]);
      }

      await client.query('COMMIT');

      res.status(201).json({
        success: true,
        data: {
          user: newUser,
          password_generated: !mot_de_passe,
          temporary_password: !mot_de_passe ? passwordToUse : undefined
        },
        message: 'Utilisateur créé avec succès'
      });

    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('❌ Erreur création utilisateur:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur lors de la création de l\'utilisateur'
      });
    } finally {
      client.release();
    }
  }
);

/**
 * @route   PUT /api/users/admin/:id
 * @desc    Mettre à jour un utilisateur (admin)
 * @access  Private (Admin)
 */
router.put(
  '/admin/:id',
  authenticateToken,
  authorizeRoles('ADMIN', 'GESTIONNAIRE'),
  [
    param('id')
      .isInt()
      .withMessage('L\'ID de l\'utilisateur doit être un nombre entier'),
    body('nom')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Le nom est requis si fourni')
    .isLength({ min: 2, max: 100 })
    .withMessage('Le nom doit contenir entre 2 et 100 caractères'),
  body('prenom')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Le prénom est requis si fourni')
    .isLength({ min: 2, max: 100 })
    .withMessage('Le prénom doit contenir entre 2 et 100 caractères'),
    body('email')
      .optional()
      .trim()
      .isEmail()
      .withMessage('Email invalide')
      .normalizeEmail(),
    body('telephone')
      .optional()
      .trim()
      .matches(/^\+?[0-9]{8,20}$/)
      .withMessage('Numéro de téléphone invalide'),
    body('statut')
      .optional()
      .isIn(['ACTIF', 'INACTIF', 'SUSPENDU'])
      .withMessage('Le statut doit être: ACTIF, INACTIF ou SUSPENDU'),
    body('centre_id')
      .optional({ nullable: true })
      .isInt()
      .withMessage('L\'ID du centre doit être un nombre entier'),
    body('logement_id')
      .optional()
      .isInt()
      .withMessage('L\'ID du logement doit être un nombre entier'),
    body('date_debut')
      .optional()
      .isISO8601()
      .withMessage('La date de début doit être au format ISO 8601'),
    body('date_fin')
      .optional()
      .isISO8601()
      .withMessage('La date de fin doit être au format ISO 8601')
  ],
  validate,
  async (req, res) => {
    const client = await db.getClient();

    try {
      const userId = req.params.id;
      const updates = req.body;
      const adminId = req.user.id;

      // Vérifier que l'utilisateur existe
      const existingUser = await client.query(
        'SELECT id, role, matricule FROM utilisateurs WHERE id = $1',
        [userId]
      );

      if (existingUser.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Utilisateur non trouvé'
        });
      }

      const user = existingUser.rows[0];

      // 🔒 Cloisonnement : un gestionnaire ne peut modifier que les
      // étudiants de son centre, et n'attribuer que des logements de son centre
      const centreScope = getCentreScope(req);
      if (centreScope !== null) {
        if (user.role !== 'ETUDIANT') {
          return res.status(403).json({
            success: false,
            error: 'Accès refusé. Un gestionnaire ne peut modifier que des étudiants.',
          });
        }
        const centreCheck = await client.query(
          `SELECT 1 FROM attributions a
           JOIN logements l ON a.logement_id = l.id
           WHERE a.utilisateur_id = $1 AND a.statut = 'ACTIVE' AND l.centre_id = $2`,
          [userId, centreScope]
        );
        if (centreCheck.rows.length === 0) {
          return res.status(403).json({
            success: false,
            error: 'Accès refusé. Cet étudiant n\'appartient pas à votre centre.',
          });
        }
        if (updates.logement_id) {
          const logementCheck = await client.query(
            'SELECT centre_id FROM logements WHERE id = $1',
            [updates.logement_id]
          );
          if (logementCheck.rows.length === 0 ||
              logementCheck.rows[0].centre_id !== centreScope) {
            return res.status(403).json({
              success: false,
              error: 'Accès refusé. Ce logement n\'appartient pas à votre centre.',
            });
          }
        }
      }

      // Vérifier l'email s'il est fourni
      if (updates.email && updates.email !== user.email) {
        const existingEmail = await client.query(
          'SELECT id FROM utilisateurs WHERE email = $1 AND id != $2',
          [updates.email, userId]
        );

        if (existingEmail.rows.length > 0) {
          return res.status(409).json({
            success: false,
            error: 'Cet email est déjà utilisé par un autre utilisateur'
          });
        }
      }

      await client.query('BEGIN');

      // Mettre à jour les informations de base
      const updateFields = [];
      const updateValues = [];
      let paramIndex = 1;

    if (updates.nom) {  // AJOUTÉ
      updateFields.push(`nom = $${paramIndex}`);
      updateValues.push(updates.nom);
      paramIndex++;
    }

    if (updates.prenom) {  // AJOUTÉ
      updateFields.push(`prenom = $${paramIndex}`);
      updateValues.push(updates.prenom);
      paramIndex++;
    }

      if (updates.email) {
        updateFields.push(`email = $${paramIndex}`);
        updateValues.push(updates.email);
        paramIndex++;
      }

      if (updates.telephone) {
        updateFields.push(`telephone = $${paramIndex}`);
        updateValues.push(updates.telephone);
        paramIndex++;
      }

      if (updates.statut) {
        updateFields.push(`statut = $${paramIndex}`);
        updateValues.push(updates.statut);
        paramIndex++;
      }

      // Rattachement à un centre : uniquement pertinent pour un GESTIONNAIRE.
      // Réservé à l'admin (un gestionnaire est déjà bloqué plus haut s'il
      // tente de modifier un non-étudiant).
      if (updates.centre_id !== undefined && user.role === 'GESTIONNAIRE') {
        if (updates.centre_id !== null) {
          const centreCheck = await client.query('SELECT id FROM centres WHERE id = $1', [updates.centre_id]);
          if (centreCheck.rows.length === 0) {
            return res.status(400).json({ success: false, error: 'Centre introuvable.' });
          }
        }
        updateFields.push(`centre_id = $${paramIndex}`);
        updateValues.push(updates.centre_id);
        paramIndex++;
      }

      // Toujours mettre à jour updated_at
      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);

      if (updateFields.length > 0) {
        updateValues.push(userId);
        await client.query(`
          UPDATE utilisateurs 
          SET ${updateFields.join(', ')}
          WHERE id = $${paramIndex}
        `, updateValues);
      }

      // Gestion de l'attribution pour les étudiants
      if (user.role === 'ETUDIANT' && (updates.logement_id || updates.date_debut || updates.date_fin)) {
        // Vérifier l'attribution existante
        const existingAttribution = await client.query(
          'SELECT id, logement_id FROM attributions WHERE utilisateur_id = $1 AND statut = \'ACTIVE\'',
          [userId]
        );

        if (existingAttribution.rows.length > 0) {
          const attribution = existingAttribution.rows[0];
          
          // Libérer l'ancien logement
          await client.query(`
            UPDATE logements 
            SET statut = 'DISPONIBLE'
            WHERE id = $1
          `, [attribution.logement_id]);

          // Mettre à jour ou terminer l'ancienne attribution
          if (updates.logement_id && updates.logement_id !== attribution.logement_id) {
            // Terminer l'ancienne attribution
            await client.query(`
              UPDATE attributions 
              SET statut = 'TERMINEE', date_fin = CURRENT_DATE, updated_at = CURRENT_TIMESTAMP
              WHERE id = $1
            `, [attribution.id]);

            // Créer une nouvelle attribution
            await client.query(`
              INSERT INTO attributions (
                utilisateur_id, logement_id, date_debut, date_fin, statut
              )
              VALUES ($1, $2, $3, $4, 'ACTIVE')
            `, [
              userId,
              updates.logement_id,
              updates.date_debut || new Date(),
              updates.date_fin || null
            ]);

            // Marquer le nouveau logement comme occupé
            await client.query(`
              UPDATE logements 
              SET statut = 'OCCUPE'
              WHERE id = $1
            `, [updates.logement_id]);
          } else {
            // Mettre à jour la date de l'attribution existante
            const attributionUpdates = [];
            const attributionValues = [];
            let attrParamIndex = 1;

            if (updates.date_debut) {
              attributionUpdates.push(`date_debut = $${attrParamIndex}`);
              attributionValues.push(updates.date_debut);
              attrParamIndex++;
            }

            if (updates.date_fin) {
              attributionUpdates.push(`date_fin = $${attrParamIndex}`);
              attributionValues.push(updates.date_fin);
              attrParamIndex++;
            }

            if (attributionUpdates.length > 0) {
              attributionUpdates.push(`updated_at = CURRENT_TIMESTAMP`);
              attributionValues.push(attribution.id);
              
              await client.query(`
                UPDATE attributions 
                SET ${attributionUpdates.join(', ')}
                WHERE id = $${attrParamIndex}
              `, attributionValues);
            }
          }
        } else if (updates.logement_id) {
          // Créer une nouvelle attribution
          await client.query(`
            INSERT INTO attributions (
              utilisateur_id, logement_id, date_debut, date_fin, statut
            )
            VALUES ($1, $2, $3, $4, 'ACTIVE')
          `, [
            userId,
            updates.logement_id,
            updates.date_debut || new Date(),
            updates.date_fin || null
          ]);

          // Marquer le logement comme occupé
          await client.query(`
            UPDATE logements 
            SET statut = 'OCCUPE'
            WHERE id = $1
          `, [updates.logement_id]);
        }
      }

      await client.query('COMMIT');

      // Récupérer l'utilisateur mis à jour (colonnes explicites, jamais u.*)
      const updatedUser = await client.query(`
        SELECT
          u.id, u.matricule, u.nom, u.prenom, u.email, u.telephone,
          u.role, u.statut, u.centre_id, u.created_at, u.updated_at,
          c.nom as centre_nom,
          l.numero_chambre,
          a.date_debut,
          a.date_fin,
          a.statut as attribution_statut
        FROM utilisateurs u
        LEFT JOIN attributions a ON u.id = a.utilisateur_id AND a.statut = 'ACTIVE'
        LEFT JOIN logements l ON a.logement_id = l.id
        LEFT JOIN centres c ON l.centre_id = c.id
        WHERE u.id = $1
      `, [userId]);

      res.json({
        success: true,
        data: updatedUser.rows[0],
        message: 'Utilisateur mis à jour avec succès'
      });

    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('❌ Erreur mise à jour utilisateur:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur lors de la mise à jour de l\'utilisateur'
      });
    } finally {
      client.release();
    }
  }
);

/**
 * @route   DELETE /api/users/admin/:id
 * @desc    Supprimer un utilisateur (ADMIN uniquement)
 * @access  Private (Admin seulement)
 */
router.delete(
  '/admin/:id',
  authenticateToken,
  authorizeRoles('ADMIN', 'GESTIONNAIRE'),
  [param('id').isInt().withMessage('ID invalide')],
  validate,
  async (req, res) => {
    const client = await db.getClient();
    try {
      const targetId = req.params.id;
      const actor    = req.user;

      // Récupérer l'utilisateur cible
      const check = await client.query(
        'SELECT id, role, matricule FROM utilisateurs WHERE id = $1', [targetId]
      );
      if (check.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
      }

      const target = check.rows[0];

      // 🔒 GESTIONNAIRE ne peut pas supprimer ADMIN ou GESTIONNAIRE
      if (actor.role === 'GESTIONNAIRE' &&
          ['ADMIN', 'GESTIONNAIRE'].includes(target.role)) {
        return res.status(403).json({
          success: false,
          error: 'Accès refusé. Un gestionnaire ne peut pas supprimer un administrateur ou un autre gestionnaire.',
        });
      }

      // 🔒 Cloisonnement : un gestionnaire ne peut désactiver que les
      // étudiants de son centre
      const centreScope = getCentreScope(req);
      if (centreScope !== null) {
        const centreCheck = await client.query(
          `SELECT 1 FROM attributions a
           JOIN logements l ON a.logement_id = l.id
           WHERE a.utilisateur_id = $1 AND a.statut = 'ACTIVE' AND l.centre_id = $2`,
          [targetId, centreScope]
        );
        if (centreCheck.rows.length === 0) {
          return res.status(403).json({
            success: false,
            error: 'Accès refusé. Cet étudiant n\'appartient pas à votre centre.',
          });
        }
      }

      await client.query('BEGIN');

      // Terminer les attributions actives et libérer les chambres
      const attributions = await client.query(
        `SELECT id, logement_id FROM attributions
         WHERE utilisateur_id = $1 AND statut = 'ACTIVE'`, [targetId]
      );
      for (const a of attributions.rows) {
        await client.query(
          `UPDATE attributions SET statut = 'TERMINEE', date_fin = CURRENT_DATE,
           updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [a.id]
        );
        await client.query(
          `UPDATE logements SET statut = 'DISPONIBLE' WHERE id = $1`, [a.logement_id]
        );
      }

      // ⚠️ SOFT DELETE — on ne supprime plus physiquement l'utilisateur :
      // le DELETE en cascade détruisait tout son historique de paiements
      // (données financières). Le compte est désactivé, l'historique conservé.
      await client.query(
        `UPDATE utilisateurs
         SET statut = 'INACTIF', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [targetId]
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        message: `Utilisateur ${target.matricule} désactivé (historique conservé)`,
      });

    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('❌ Erreur suppression utilisateur:', error);
      res.status(500).json({ success: false, error: 'Erreur lors de la suppression' });
    } finally {
      client.release();
    }
  }
);


// Fonctions helpers
function generateDefaultPassword() {
  // crypto.randomBytes : Math.random() est prédictible, inutilisable pour
  // générer des mots de passe.
  const crypto = require('crypto');
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.randomBytes(10);
  let password = '';
  for (let i = 0; i < bytes.length; i++) {
    password += chars[bytes[i] % chars.length];
  }
  return password + 'A1!'; // garantit majuscule + chiffre + spécial
}

module.exports = router;