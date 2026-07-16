/**
 * Règles de validation : paiements.
 */
const { body, query, validationResult } = require('express-validator');

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

const initierPaiementValidation = [
  body('montant')
    .notEmpty().withMessage('Le montant est requis')
    .isFloat({ min: 0 }).withMessage('Le montant doit être un nombre positif'),

  body('mode_paiement')
    .notEmpty().withMessage('Le mode de paiement est requis')
    .isIn(['ORANGE_MONEY', 'MOOV_MONEY']).withMessage('Mode de paiement invalide'),

  body('numero_telephone')
    .notEmpty().withMessage('Le numéro de téléphone est requis')
    .matches(/^\+?[0-9]{8,15}$/).withMessage('Numéro de téléphone invalide'),
];

const adminPaiementsValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Le numéro de page doit être supérieur à 0'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('La limite doit être entre 1 et 100'),

  query('statut')
    .optional()
    .isIn(['EN_ATTENTE', 'CONFIRME', 'ECHEC', 'TOUS'])
    .withMessage('Le statut doit être: EN_ATTENTE, CONFIRME, ECHEC ou TOUS'),

  query('mode_paiement')
    .optional()
    .isIn(['ORANGE_MONEY', 'MOOV_MONEY', 'ESPECES', 'VIREMENT', 'TOUS'])
    .withMessage('Le mode de paiement doit être: ORANGE_MONEY, MOOV_MONEY, ESPECES, VIREMENT ou TOUS'),

  query('date_from')
    .optional()
    .isISO8601()
    .withMessage('La date de début doit être au format ISO 8601'),

  query('date_to')
    .optional()
    .isISO8601()
    .withMessage('La date de fin doit être au format ISO 8601'),

  query('centre_id')
    .optional()
    .isInt()
    .withMessage('L\'ID du centre doit être un nombre entier'),

  query('search')
    .optional()
    .trim()
    .isLength({ min: 2 })
    .withMessage('La recherche doit contenir au moins 2 caractères'),
];

const changerStatutValidation = [
  body('statut')
    .isIn(['CONFIRME', 'ECHEC', 'EN_ATTENTE'])
    .withMessage('Le statut doit être: CONFIRME, ECHEC ou EN_ATTENTE'),

  body('raison')
    .optional()
    .trim()
    .isLength({ min: 5, max: 500 })
    .withMessage('La raison doit contenir entre 5 et 500 caractères'),
];

module.exports = {
  validate,
  initierPaiementValidation,
  adminPaiementsValidation,
  changerStatutValidation,
};
