// routes/annonces.js
const express = require('express');
const router = express.Router();
const annonceController = require('../controllers/annonceController');
const { authenticateToken, authorizeRoles } = require('../middlewares/authMiddleware');

// Créer une annonce
router.post('/send', 
  authenticateToken, 
  authorizeRoles('ADMIN', 'GESTIONNAIRE'), 
  annonceController.sendAnnonce
);

// Récupérer toutes les annonces (admin)
router.get('/admin/all', 
  authenticateToken, 
  authorizeRoles('ADMIN', 'GESTIONNAIRE'), 
  annonceController.getAnnoncesAdmin
);

// Récupérer les annonces pour étudiants
router.get('/', 
  authenticateToken, 
  annonceController.getAnnoncesEtudiant
);

// Récupérer une annonce spécifique par ID
router.get('/:annonceId', 
  authenticateToken, 
  annonceController.getAnnonceById
);

// Mettre à jour le statut
router.put('/admin/:annonceId/statut', 
  authenticateToken, 
  authorizeRoles('ADMIN', 'GESTIONNAIRE'), 
  annonceController.updateAnnonceStatut
);

// Supprimer une annonce - CORRECTION : retirer "/admin" du chemin
router.delete('/:annonceId', 
  authenticateToken, 
  authorizeRoles('ADMIN', 'GESTIONNAIRE'), 
  annonceController.deleteAnnonce
);

module.exports = router;