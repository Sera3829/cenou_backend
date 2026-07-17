/**
 * Routes /api/logements — câblage uniquement.
 * Lecture : authentifié. Édition/suppression d'une chambre : ADMIN.
 */
const express = require('express');
const router = express.Router();
const logementController = require('../controllers/logementController');
const centreController = require('../controllers/centreController');
const { authenticateToken, authorizeRoles } = require('../middlewares/authMiddleware');
const { validate, idParam, majChambreValidation } = require('../validators/centreValidator');

const admin = [authenticateToken, authorizeRoles('ADMIN')];

router.get('/', authenticateToken, logementController.liste);

// Gestion d'une chambre (ADMIN)
router.put('/:id', ...admin, majChambreValidation, validate, centreController.mettreAJourChambre);

router.delete('/:id', ...admin, idParam, validate, centreController.supprimerChambre);

router.get('/:id', authenticateToken, logementController.detail);

module.exports = router;
