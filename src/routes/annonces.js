/**
 * Routes /api/annonces — câblage uniquement.
 */
const express = require('express');
const router = express.Router();
const annonceController = require('../controllers/annonceController');
const { authenticateToken, authorizeRoles } = require('../middlewares/authMiddleware');

const gestion = [authenticateToken, authorizeRoles('ADMIN', 'GESTIONNAIRE')];

// Routes admin (avant les routes paramétriques pour éviter tout masquage)
router.post('/send', ...gestion, annonceController.sendAnnonce);
router.get('/admin/all', ...gestion, annonceController.getAnnoncesAdmin);
router.put('/admin/:annonceId/statut', ...gestion, annonceController.updateAnnonceStatut);

// Messagerie interne du staff (cloche du dashboard)
router.get('/inbox', ...gestion, annonceController.getInbox);
router.put('/:annonceId/lu', ...gestion, annonceController.marquerLu);

// Routes utilisateur
router.get('/', authenticateToken, annonceController.getAnnoncesEtudiant);
router.delete('/:annonceId', ...gestion, annonceController.deleteAnnonce);
router.get('/:annonceId', authenticateToken, annonceController.getAnnonceById);

module.exports = router;
