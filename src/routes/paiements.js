/**
 * Routes /api/paiements — câblage uniquement.
 * Validation → validators/paiementValidator, logique → controllers/paiementController.
 */
const express = require('express');
const router = express.Router();
const paiementController = require('../controllers/paiementController');
const { authenticateToken, authorizeRoles } = require('../middlewares/authMiddleware');
const {
  validate,
  initierPaiementValidation,
  adminPaiementsValidation,
  changerStatutValidation,
} = require('../validators/paiementValidator');

// ── Étudiant ─────────────────────────────────────────────────────────────

router.get('/', authenticateToken, authorizeRoles('ETUDIANT'), paiementController.getPaiements);

router.get('/pending', authenticateToken, authorizeRoles('ETUDIANT'), paiementController.getPendingPaiements);

router.get('/loyer', authenticateToken, authorizeRoles('ETUDIANT'), paiementController.getLoyer);

router.post(
  '/initier',
  authenticateToken,
  authorizeRoles('ETUDIANT'),
  initierPaiementValidation,
  validate,
  paiementController.initierPaiement
);

// Callback opérateur : public mais protégé par secret partagé (voir controller)
router.post('/callback', paiementController.callbackPaiement);

// SIMULATION — confirmer son propre paiement (temporaire, avant CinetPay)
router.post(
  '/:id/simuler',
  authenticateToken,
  authorizeRoles('ETUDIANT'),
  paiementController.simulerConfirmation
);

router.get('/:id', authenticateToken, authorizeRoles('ETUDIANT'), paiementController.getPaiementById);

// ── Admin / Gestionnaire (cloisonné par centre côté service) ────────────

router.get(
  '/admin/statistics',
  authenticateToken,
  authorizeRoles('ADMIN', 'GESTIONNAIRE'),
  paiementController.getStatistiquesAdmin
);

router.get(
  '/admin/all',
  authenticateToken,
  authorizeRoles('ADMIN', 'GESTIONNAIRE'),
  adminPaiementsValidation,
  validate,
  paiementController.getListeAdmin
);

router.get(
  '/admin/:id',
  authenticateToken,
  authorizeRoles('ADMIN', 'GESTIONNAIRE'),
  paiementController.getDetailAdmin
);

router.put(
  '/admin/:id/statut',
  authenticateToken,
  authorizeRoles('ADMIN', 'GESTIONNAIRE'),
  changerStatutValidation,
  validate,
  paiementController.changerStatutAdmin
);

module.exports = router;
