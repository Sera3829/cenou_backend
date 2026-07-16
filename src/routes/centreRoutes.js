/**
 * Routes /api/centres — câblage uniquement.
 */
const express = require('express');
const router = express.Router();
const centreController = require('../controllers/centreController');
const { authenticateToken, authorizeRoles } = require('../middlewares/authMiddleware');

router.get('/', authenticateToken, centreController.liste);

router.get(
  '/:id/etudiants',
  authenticateToken,
  authorizeRoles('ADMIN', 'GESTIONNAIRE'),
  centreController.etudiants
);

router.get('/:id', authenticateToken, centreController.detail);

module.exports = router;
