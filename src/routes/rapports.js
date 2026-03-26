const express = require('express');
const router = express.Router();
const rapportController = require('../controllers/rapportController');
const { authenticateToken, authorizeRoles } = require('../middlewares/authMiddleware');
const { body, validationResult } = require('express-validator');

// Validation génération rapport financier
const financierValidation = [
    body('format')
        .notEmpty().withMessage('Le format est requis')
        .isIn(['pdf', 'excel']).withMessage('Format invalide (pdf ou excel)'),

    body('periode')
        .optional()
        .isIn(['mois_en_cours', 'mois_dernier', 'personnalisee'])
        .withMessage('Période invalide'),

    body('centre_id')
        .optional()
        .isInt().withMessage('ID centre invalide'),

    body('date_debut')
        .optional()
        .isISO8601().withMessage('Date début invalide'),

    body('date_fin')
        .optional()
        .isISO8601().withMessage('Date fin invalide'),
];

// Validation génération rapport occupation
const occupationValidation = [
    body('format')
        .notEmpty().withMessage('Le format est requis')
        .isIn(['pdf', 'excel']).withMessage('Format invalide (pdf ou excel)'),

    body('centre_id')
        .optional()
        .isInt().withMessage('ID centre invalide'),
];

const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            error: 'Erreur de validation',
            details: errors.array(),
        });
    }
    next();
};

/**
 * @route   POST /api/rapports/financier
 * @desc    Générer un rapport financier (PDF ou Excel)
 * @access  Private (Gestionnaire, Admin)
 */
router.post(
    '/financier',
    authenticateToken,
    authorizeRoles('GESTIONNAIRE', 'ADMIN'),
    financierValidation,
    validate,
    rapportController.genererRapportFinancier
);

/**
 * @route   POST /api/rapports/occupation
 * @desc    Générer un rapport d'occupation (PDF ou Excel)
 * @access  Private (Gestionnaire, Admin)
 */
router.post(
    '/occupation',
    authenticateToken,
    authorizeRoles('GESTIONNAIRE', 'ADMIN'),
    occupationValidation,
    validate,
    rapportController.genererRapportOccupation
);

module.exports = router;