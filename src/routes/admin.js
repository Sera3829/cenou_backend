const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticateToken, authorizeRoles } = require('../middlewares/authMiddleware');
const { body, query, validationResult } = require('express-validator');

// Middleware de validation
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }
  next();
};

// ==================== DASHBOARD ====================

/**
 * @route   GET /api/admin/dashboard/stats
 * @desc    Récupérer les statistiques du dashboard
 * @access  Private (Admin, Gestionnaire)
 */
router.get(
  '/dashboard/stats',
  authenticateToken,
  authorizeRoles('ADMIN', 'GESTIONNAIRE'),
  adminController.getDashboardStats
);

/**
 * @route   GET /api/admin/dashboard/charts
 * @desc    Récupérer les données pour les graphiques
 * @access  Private (Admin, Gestionnaire)
 */
router.get(
  '/dashboard/charts',
  authenticateToken,
  authorizeRoles('ADMIN', 'GESTIONNAIRE'),
  [
    query('period')
      .optional()
      .isIn(['day', 'week', 'month', 'year'])
      .withMessage('La période doit être: day, week, month ou year'),
    query('centre_id')
      .optional()
      .isInt()
      .withMessage('L\'ID du centre doit être un nombre entier')
  ],
  validate,
  adminController.getChartsData
);

/**
 * @route   GET /api/admin/dashboard/recent-activity
 * @desc    Récupérer l'activité récente
 * @access  Private (Admin, Gestionnaire)
 */
router.get(
  '/dashboard/recent-activity',
  authenticateToken,
  authorizeRoles('ADMIN', 'GESTIONNAIRE'),
  [
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('La limite doit être entre 1 et 100')
  ],
  validate,
  adminController.getRecentActivity
);

// ==================== RAPPORTS ====================

/**
 * @route   GET /api/admin/reports/financial
 * @desc    Générer un rapport financier
 * @access  Private (Admin, Gestionnaire)
 */
router.get(
  '/reports/financial',
  authenticateToken,
  authorizeRoles('ADMIN', 'GESTIONNAIRE'),
  [
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
    query('statut')
      .optional()
      .isIn(['CONFIRME', 'EN_ATTENTE', 'ECHEC', 'TOUS'])
      .withMessage('Le statut doit être: CONFIRME, EN_ATTENTE, ECHEC ou TOUS'),
    query('format')
      .optional()
      .isIn(['json', 'csv', 'pdf'])
      .withMessage('Le format doit être: json, csv ou pdf')
  ],
  validate,
  adminController.getFinancialReport
);

/**
 * @route   GET /api/admin/reports/users
 * @desc    Générer un rapport utilisateurs
 * @access  Private (Admin)
 */
router.get(
  '/reports/users',
  authenticateToken,
  authorizeRoles('ADMIN'),
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
    query('format')
      .optional()
      .isIn(['json', 'csv'])
      .withMessage('Le format doit être: json ou csv')
  ],
  validate,
  adminController.getUsersReport
);

// ==================== ANNONCES ====================

/**
 * @route   POST /api/admin/annonces
 * @desc    Créer une annonce
 * @access  Private (Admin, Gestionnaire)
 */
router.post(
  '/annonces',
  authenticateToken,
  authorizeRoles('ADMIN', 'GESTIONNAIRE'),
  [
    body('titre')
      .trim()
      .notEmpty()
      .withMessage('Le titre est requis')
      .isLength({ min: 5, max: 200 })
      .withMessage('Le titre doit contenir entre 5 et 200 caractères'),
    body('contenu')
      .trim()
      .notEmpty()
      .withMessage('Le contenu est requis')
      .isLength({ min: 10, max: 5000 })
      .withMessage('Le contenu doit contenir entre 10 et 5000 caractères'),
    body('cible')
      .isIn(['TOUS', 'ETUDIANTS', 'GESTIONNAIRES', 'CENTRE_SPECIFIQUE'])
      .withMessage('La cible doit être: TOUS, ETUDIANTS, GESTIONNAIRES ou CENTRE_SPECIFIQUE'),
    body('centre_id')
      .optional()
      .isInt()
      .withMessage('L\'ID du centre doit être un nombre entier'),
    body('date_publication')
      .optional()
      .isISO8601()
      .withMessage('La date de publication doit être au format ISO 8601'),
    body('date_expiration')
      .optional()
      .isISO8601()
      .withMessage('La date d\'expiration doit être au format ISO 8601')
      .custom((value, { req }) => {
        if (value && req.body.date_publication && new Date(value) <= new Date(req.body.date_publication)) {
          throw new Error('La date d\'expiration doit être après la date de publication');
        }
        return true;
      })
  ],
  validate,
  adminController.createAnnouncement
);

// ==================== UTILITAIRES ====================

/**
 * @route   GET /api/admin/health
 * @desc    Vérifier la santé de l'API admin
 * @access  Private (Admin, Gestionnaire)
 */
router.get('/health', authenticateToken, authorizeRoles('ADMIN', 'GESTIONNAIRE'), (req, res) => {
  res.json({
    success: true,
    message: 'API Admin CENOU fonctionnelle',
    timestamp: new Date().toISOString(),
    user: {
      id: req.user.id,
      role: req.user.role,
      name: `${req.user.prenom} ${req.user.nom}`
    }
  });
});

module.exports = router;