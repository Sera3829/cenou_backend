/**
 * Routes /api/centres — câblage uniquement.
 * Lecture : tout utilisateur authentifié / admin+gestionnaire.
 * Gestion (création, édition, suppression, chambres) : ADMIN uniquement.
 */
const express = require('express');
const router = express.Router();
const centreController = require('../controllers/centreController');
const { authenticateToken, authorizeRoles } = require('../middlewares/authMiddleware');
const {
  validate,
  idParam,
  creerCentreValidation,
  majCentreValidation,
  creerChambreValidation,
} = require('../validators/centreValidator');

const admin = [authenticateToken, authorizeRoles('ADMIN')];

// ── Administration (ADMIN) — avant les routes paramétriques ──────────────

router.get('/admin/all', ...admin, centreController.listeAdmin);

router.post('/', ...admin, creerCentreValidation, validate, centreController.creer);

router.put('/:id', ...admin, majCentreValidation, validate, centreController.mettreAJour);

router.delete('/:id', ...admin, idParam, validate, centreController.supprimer);

// Chambres d'un centre
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
