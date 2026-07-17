/**
 * Routes /api/centres — câblage uniquement.
 * Lecture : tout utilisateur authentifié / admin+gestionnaire.
 * Gestion (création, édition, suppression, chambres) : ADMIN uniquement.
 */
const express = require('express');
const router = express.Router();
const centreController = require('../controllers/centreController');
const pavillonController = require('../controllers/pavillonController');
const { authenticateToken, authorizeRoles } = require('../middlewares/authMiddleware');
const {
  validate,
  idParam,
  creerCentreValidation,
  majCentreValidation,
  creerChambreValidation,
} = require('../validators/centreValidator');
const {
  creerPavillonValidation,
} = require('../validators/pavillonValidator');

const admin = [authenticateToken, authorizeRoles('ADMIN')];

// ── Administration (ADMIN) — avant les routes paramétriques ──────────────

router.get('/admin/all', ...admin, centreController.listeAdmin);

router.post('/', ...admin, creerCentreValidation, validate, centreController.creer);

router.put('/:id', ...admin, majCentreValidation, validate, centreController.mettreAJour);

router.delete('/:id', ...admin, idParam, validate, centreController.supprimer);

// Pavillons d'un centre
router.get('/:id/pavillons', ...admin, idParam, validate, pavillonController.liste);

router.post('/:id/pavillons', ...admin, creerPavillonValidation, validate, pavillonController.creer);

// Chambres d'un centre (vue à plat, tous pavillons confondus)
router.get('/:id/logements', ...admin, idParam, validate, centreController.chambres);

router.post('/:id/logements', ...admin, creerChambreValidation, validate, centreController.creerChambre);

// ── Lecture (authentifié) ────────────────────────────────────────────────

router.get('/', authenticateToken, centreController.liste);

router.get(
  '/:id/etudiants',
  authenticateToken,
  authorizeRoles('ADMIN', 'GESTIONNAIRE'),
  centreController.etudiants
);

router.get('/:id', authenticateToken, centreController.detail);

module.exports = router;
