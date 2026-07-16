/**
 * Routes /api/users — câblage uniquement.
 * Validation → validators/, logique → controllers/ (+ services/).
 */
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const userAdminController = require('../controllers/userAdminController');
const { authenticateToken, authorizeRoles } = require('../middlewares/authMiddleware');
const {
  updateProfileValidation,
  changePasswordValidation,
  validate,
} = require('../validators/authValidator');
const {
  listeValidation,
  idParam,
  creerValidation,
  mettreAJourValidation,
  changerStatutValidation,
} = require('../validators/userValidator');

// ── Compte de l'utilisateur connecté ─────────────────────────────────────

router.get('/profile', authenticateToken, userController.getProfile);

router.put('/profile', authenticateToken, updateProfileValidation, validate, userController.updateProfile);

router.put('/change-password', authenticateToken, changePasswordValidation, validate, userController.changePassword);

router.get('/attributions', authenticateToken, userController.getAttributionsHistory);

router.get('/stats', authenticateToken, userController.getUserStats);

router.delete('/account', authenticateToken, userController.deactivateAccount);

// ── Administration (ADMIN / GESTIONNAIRE, cloisonné par centre) ──────────

const admin = [authenticateToken, authorizeRoles('ADMIN', 'GESTIONNAIRE')];

router.get('/admin/all', ...admin, listeValidation, validate, userAdminController.liste);

router.get('/admin/etudiants', ...admin, userAdminController.etudiants);

router.post('/admin/create', ...admin, creerValidation, validate, userAdminController.creer);

router.put('/admin/:id/statut', ...admin, changerStatutValidation, validate, userAdminController.changerStatut);

router.get('/admin/:id', ...admin, idParam, validate, userAdminController.detail);

router.put('/admin/:id', ...admin, mettreAJourValidation, validate, userAdminController.mettreAJour);

router.delete('/admin/:id', ...admin, idParam, validate, userAdminController.supprimer);

module.exports = router;
