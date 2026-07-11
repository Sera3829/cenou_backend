// routes/centreRoutes.js
const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken, authorizeRoles } = require('../middlewares/authMiddleware');

/**
 * @route   GET /api/centres
 * @desc    Récupérer tous les centres
 * @access  Private
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    console.log('📥 [CENTRES] Récupération de tous les centres');

    const result = await db.query(`
      SELECT 
        id,
        nom,
        ville,
        adresse,
        capacite_totale,
        created_at
      FROM centres
      ORDER BY nom ASC
    `);

    console.log(`✅ [CENTRES] ${result.rows.length} centres trouvés`);

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });

  } catch (error) {
    console.error('❌ [CENTRES] Erreur:', error);
    res.status(500).json({
      error: 'Erreur lors de la récupération des centres',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined
    });
  }
});

/**
 * @route   GET /api/centres/:id
 * @desc    Récupérer un centre par ID
 * @access  Private
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`📥 [CENTRES] Récupération centre ID: ${id}`);

    const result = await db.query(`
      SELECT 
        id,
        nom,
        ville,
        adresse,
        capacite_totale,
        created_at
      FROM centres
      WHERE id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Centre non trouvé'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('❌ [CENTRES] Erreur:', error);
    res.status(500).json({
      error: 'Erreur lors de la récupération du centre',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined
    });
  }
});

/**
 * @route   GET /api/centres/:id/etudiants
 * @desc    Récupérer tous les étudiants d'un centre
 * @access  Private (Admin/Gestionnaire)
 */
router.get('/:id/etudiants', 
  authenticateToken, 
  authorizeRoles('ADMIN', 'GESTIONNAIRE'),
  async (req, res) => {
    try {
      const { id } = req.params;

      console.log(`📥 [CENTRES] Récupération étudiants du centre ID: ${id}`);

      const result = await db.query(`
        SELECT DISTINCT ON (u.id)
          u.id,
          u.matricule,
          u.nom,
          u.prenom,
          u.email,
          u.telephone,
          u.statut,
          c.nom as centre_nom,
          l.numero_chambre
        FROM utilisateurs u
        INNER JOIN attributions a ON u.id = a.utilisateur_id
        INNER JOIN logements l ON a.logement_id = l.id
        INNER JOIN centres c ON l.centre_id = c.id
        WHERE c.id = $1
          AND u.role = 'ETUDIANT'
          AND u.statut = 'ACTIF'
          AND a.statut = 'ACTIVE'
        ORDER BY u.id, a.date_debut DESC
      `, [id]);

      console.log(`✅ [CENTRES] ${result.rows.length} étudiants trouvés`);

      res.json({
        success: true,
        data: result.rows,
        count: result.rows.length
      });

    } catch (error) {
      console.error('❌ [CENTRES] Erreur:', error);
      res.status(500).json({
        error: 'Erreur lors de la récupération des étudiants',
        details: process.env.NODE_ENV !== 'production' ? error.message : undefined
      });
    }
  }
);

module.exports = router;