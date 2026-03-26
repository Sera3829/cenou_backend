const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { authenticateToken, authorizeRoles } = require('../middlewares/authMiddleware');
const { body, validationResult } = require('express-validator');

// Middleware de validation
const registerTokenValidation = [
  body('fcm_token')
    .notEmpty().withMessage('Le token FCM est requis')
    .isString().withMessage('Le token FCM doit être une chaîne de caractères'),
  
  body('device_type')
    .optional()
    .isIn(['android', 'ios', 'web']).withMessage('Type d\'appareil invalide'),
];

const sendNotificationValidation = [
  body('userId')
    .notEmpty().withMessage('L\'ID utilisateur est requis')
    .isInt().withMessage('L\'ID utilisateur doit être un entier'),
  
  body('title')
    .notEmpty().withMessage('Le titre est requis')
    .isLength({ max: 100 }).withMessage('Le titre ne doit pas dépasser 100 caractères'),
  
  body('message')
    .notEmpty().withMessage('Le message est requis')
    .isLength({ max: 500 }).withMessage('Le message ne doit pas dépasser 500 caractères'),
  
  body('type')
    .optional()
    .isIn(['INFO', 'PAIEMENT', 'SIGNALEMENT', 'ANNONCE', 'ALERTE'])
    .withMessage('Type de notification invalide'),
];

const sendBulkValidation = [
  body('userIds')
    .isArray({ min: 1 }).withMessage('La liste des utilisateurs est requise')
    .custom((value) => value.every(id => Number.isInteger(id)))
    .withMessage('Tous les IDs doivent être des entiers'),
  
  body('title')
    .notEmpty().withMessage('Le titre est requis')
    .isLength({ max: 100 }).withMessage('Le titre ne doit pas dépasser 100 caractères'),
  
  body('message')
    .notEmpty().withMessage('Le message est requis')
    .isLength({ max: 500 }).withMessage('Le message ne doit pas dépasser 500 caractères'),
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
 * @route   POST /api/notifications/register-token
 * @desc    Enregistrer le token FCM de l'appareil
 * @access  Private
 */
router.post(
  '/register-token',
  authenticateToken,
  registerTokenValidation,
  validate,
  notificationController.registerFCMToken
);

/**
 * @route   GET /api/notifications
 * @desc    Récupérer l'historique des notifications
 * @access  Private
 */
router.get(
  '/',
  authenticateToken,
  notificationController.getNotifications
);

router.get('/debug-user-type', authenticateToken, notificationController.debugUserType);

/**
 * @route   PUT /api/notifications/:id/read
 * @desc    Marquer une notification comme lue
 * @access  Private
 */
router.put(
  '/:id/read',
  authenticateToken,
  notificationController.markNotificationAsRead
);

/**
 * @route   PUT /api/notifications/read-all
 * @desc    Marquer toutes les notifications comme lues
 * @access  Private
 */
router.put(
  '/read-all',
  authenticateToken,
  notificationController.markAllNotificationsAsRead
);

/**
 * @route   DELETE /api/notifications/:id
 * @desc    Supprimer une notification
 * @access  Private
 */
router.delete(
  '/:id',
  authenticateToken,
  notificationController.deleteNotification
);

/**
 * @route   POST /api/notifications/send
 * @desc    Envoyer une notification à un utilisateur
 * @access  Private (Gestionnaire, Admin)
 */
router.post(
  '/send',
  authenticateToken,
  authorizeRoles('GESTIONNAIRE', 'ADMIN'),
  sendNotificationValidation,
  validate,
  notificationController.sendNotification
);

/**
 * @route   POST /api/notifications/send-bulk
 * @desc    Envoyer des notifications à plusieurs utilisateurs
 * @access  Private (Gestionnaire, Admin)
 */
router.post(
  '/send-bulk',
  authenticateToken,
  authorizeRoles('GESTIONNAIRE', 'ADMIN'),
  sendBulkValidation,
  validate,
  notificationController.sendBulkNotifications
);

/**
 * @route   POST /api/notifications/send-by-centre
 * @desc    Envoyer une notification à tous les étudiants d'un centre
 * @access  Private (Gestionnaire, Admin)
 */
router.post(
  '/send-by-centre',
  authenticateToken,
  authorizeRoles('GESTIONNAIRE', 'ADMIN'),
  [
    body('centre_id')
      .notEmpty().withMessage('L\'ID du centre est requis')
      .isInt().withMessage('L\'ID du centre doit être un entier'),
    body('title').notEmpty().withMessage('Le titre est requis'),
    body('message').notEmpty().withMessage('Le message est requis'),
  ],
  validate,
  notificationController.sendNotificationByCentre
);

module.exports = router;