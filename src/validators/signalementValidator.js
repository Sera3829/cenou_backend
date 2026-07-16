/**
 * Règles de validation : signalements.
 */
const { body, param, validationResult } = require('express-validator');

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

const creerSignalementValidation = [
  body('type_probleme')
    .notEmpty().withMessage('Le type de problème est requis')
    .isIn(['PLOMBERIE', 'ELECTRICITE', 'TOITURE', 'SERRURE', 'MOBILIER', 'AUTRE'])
    .withMessage('Type de problème invalide'),

  body('description')
    .notEmpty().withMessage('La description est requise')
    .isLength({ min: 10 }).withMessage('La description doit contenir au moins 10 caractères')
    .isLength({ max: 1000 }).withMessage('La description ne doit pas dépasser 1000 caractères'),
];

const changerStatutValidation = [
  body('statut')
    .notEmpty().withMessage('Le statut est requis')
    .isIn(['EN_ATTENTE', 'EN_COURS', 'RESOLU', 'ANNULE'])
    .withMessage('Statut invalide'),

  body('commentaire_resolution')
    .optional()
    .trim()
    .isLength({ min: 1 }).withMessage('Le commentaire ne peut pas être vide'),
];

const affecterEquipeValidation = [
  param('id')
    .isInt()
    .withMessage('L\'ID du signalement doit être un nombre entier'),
  body('equipe_id')
    .isInt()
    .withMessage('L\'ID de l\'équipe doit être un nombre entier'),
  body('commentaire')
    .optional()
    .trim()
    .isLength({ min: 5, max: 500 })
    .withMessage('Le commentaire doit contenir entre 5 et 500 caractères'),
];

module.exports = {
  validate,
  creerSignalementValidation,
  changerStatutValidation,
  affecterEquipeValidation,
};
