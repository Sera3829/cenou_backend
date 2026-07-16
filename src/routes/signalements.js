/**
 * Routes /api/signalements — câblage uniquement.
 * Validation → validators/signalementValidator, logique → controllers/signalementController.
 */
const express = require('express');
const router = express.Router();
const signalementController = require('../controllers/signalementController');
const { authenticateToken, authorizeRoles } = require('../middlewares/authMiddleware');
const { uploadSignalementPhotos } = require('../middlewares/uploadMiddleware');
const {
  validate,
  creerSignalementValidation,
  changerStatutValidation,
  affecterEquipeValidation,
} = require('../validators/signalementValidator');

// ── Étudiant ─────────────────────────────────────────────────────────────

router.post(
  '/',
  authenticateToken,
  authorizeRoles('ETUDIANT'),
  uploadSignalementPhotos,
  creerSignalementValidation,
  validate,
  signalementController.creerSignalement
);

router.get('/', authenticateToken, authorizeRoles('ETUDIANT'), signalementController.getSignalements);

// ── Admin / Gestionnaire (cloisonné par centre côté service) ────────────

router.get(
  '/admin/statistics',
  authenticateToken,
  authorizeRoles('ADMIN', 'GESTIONNAIRE'),
  signalementController.getStatistiquesAdmin
);

router.get(
  '/admin/teams',
  authenticateToken,
  authorizeRoles('ADMIN', 'GESTIONNAIRE'),
  signalementController.getEquipes
);

router.get(
  '/admin/all',
  authenticateToken,
  authorizeRoles('GESTIONNAIRE', 'ADMIN'),
  signalementController.getAllSignalements
);

router.get(
  '/admin/:id',
  authenticateToken,
  authorizeRoles('GESTIONNAIRE', 'ADMIN'),
  signalementController.getSignalementAdminById
);

router.put(
  '/admin/:id/statut',
  authenticateToken,
  authorizeRoles('GESTIONNAIRE', 'ADMIN'),
  changerStatutValidation,
  validate,
  signalementController.updateSignalementStatut
);

router.post(
  '/admin/:id/assign',
  authenticateToken,
  authorizeRoles('ADMIN', 'GESTIONNAIRE'),
  affecterEquipeValidation,
  validate,
  signalementController.affecterEquipe
);

// ── Étudiant (routes paramétriques en dernier) ───────────────────────────

router.get(
  '/:id/photos/:photoIndex',
  authenticateToken,
  authorizeRoles('ETUDIANT'),
  signalementController.getSignalementPhoto
);

router.get('/:id', authenticateToken, authorizeRoles('ETUDIANT'), signalementController.getSignalementById);

module.exports = router;
