/**
 * Routes /api/logements — câblage uniquement.
 */
const express = require('express');
const router = express.Router();
const logementController = require('../controllers/logementController');
const { authenticateToken } = require('../middlewares/authMiddleware');

router.get('/', authenticateToken, logementController.liste);

router.get('/:id', authenticateToken, logementController.detail);

module.exports = router;
