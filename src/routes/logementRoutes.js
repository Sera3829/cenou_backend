// routes/logementRoutes.js
const express = require('express');
const router  = express.Router();
const db      = require('../config/database');
const { authenticateToken } = require('../middlewares/authMiddleware');

/**
 * @route   GET /api/logements
 * @desc    Récupérer les logements (filtrable par centre_id et/ou statut)
 * @access  Private
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { centre_id, statut } = req.query;

    let sql    = `SELECT id, centre_id, numero_chambre, type_chambre,
                         prix_mensuel::integer as prix_mensuel, statut, created_at
                  FROM logements WHERE 1=1`;
    const params = [];
    let idx = 1;

    if (centre_id) {
      sql += ` AND centre_id = $${idx++}`;
      params.push(parseInt(centre_id));
    }
    if (statut) {
      sql += ` AND statut = $${idx++}`;
      params.push(statut);
    }
    sql += ` ORDER BY type_chambre ASC, numero_chambre ASC`;

    const result = await db.query(sql, params);

    res.json({
      success: true,
      data:    result.rows,
      count:   result.rows.length,
    });

  } catch (error) {
    console.error('❌ [LOGEMENTS] Erreur:', error);
    res.status(500).json({
      error:   'Erreur lors de la récupération des logements',
      details: error.message,
    });
  }
});

/**
 * @route   GET /api/logements/:id
 * @desc    Récupérer un logement par ID
 * @access  Private
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT l.id, l.centre_id, l.numero_chambre, l.type_chambre,
             l.prix_mensuel::integer as prix_mensuel, l.statut, l.created_at,
             c.nom as centre_nom, c.ville
      FROM logements l
      JOIN centres c ON l.centre_id = c.id
      WHERE l.id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Logement non trouvé' });
    }

    res.json({ success: true, data: result.rows[0] });

  } catch (error) {
    console.error('❌ [LOGEMENTS] Erreur:', error);
    res.status(500).json({
      error: 'Erreur lors de la récupération du logement',
      details: error.message,
    });
  }
});

module.exports = router;