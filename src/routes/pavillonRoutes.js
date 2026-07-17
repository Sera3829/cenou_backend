/**
 * Routes /api/pavillons — câblage uniquement. Gestion réservée ADMIN.
 */
const express = require('express');
const router = express.Router();
const pavillonController = require('../controllers/pavillonController');
const { authenticateToken, authorizeRoles } = require('../middlewares/authMiddleware');
const {
  validate,
  idParam,
  majPavillonValidation,
  creerChambreValidation,
  bulkChambreValidation,
} = require('../validators/pavillonValidator');

const admin = [authenticateToken, authorizeRoles('ADMIN')];

router.put('/:id', ...admin, majPavillonValidation, validate, pavillonController.mettreAJour);

router.delete('/:id', ...admin, idParam, validate, pavillonController.supprimer);

// Chambres du pavillon
router.get('/:id/logements', ...admin, idParam, validate, pavillonController.chambres);

router.post('/:id/logements', ...admin, creerChambreValidation, validate, pavillonController.creerChambre);

// Création en masse
router.post('/:id/logements/bulk', ...admin, bulkChambreValidation, validate, pavillonController.creerChambresEnMasse);

module.exports = router;
