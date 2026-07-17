/**
 * Règles de validation : pavillons et création de chambres.
 */
const { body, param } = require('express-validator');
const { validate } = require('./authValidator');

const TYPES_CHAMBRE = ['SIMPLE', 'DOUBLE', 'STUDIO'];
const STATUTS_CHAMBRE = ['DISPONIBLE', 'OCCUPE', 'MAINTENANCE'];

const idParam = [param('id').isInt().withMessage('ID invalide')];

const creerPavillonValidation = [
  ...idParam, // :id = centre
  body('nom').trim().notEmpty().withMessage('Le nom du pavillon est requis')
    .isLength({ min: 1, max: 100 }).withMessage('Le nom ne doit pas dépasser 100 caractères'),
  body('capacite').optional().isInt({ min: 0 })
    .withMessage('La capacité doit être un entier positif'),
];

const majPavillonValidation = [
  ...idParam, // :id = pavillon
  body('nom').optional().trim().notEmpty()
    .isLength({ min: 1, max: 100 }).withMessage('Le nom ne doit pas dépasser 100 caractères'),
  body('capacite').optional().isInt({ min: 0 })
    .withMessage('La capacité doit être un entier positif'),
];

const creerChambreValidation = [
  ...idParam, // :id = pavillon
  body('numero_chambre').trim().notEmpty().withMessage('Le numéro de chambre est requis')
    .isLength({ max: 20 }).withMessage('Le numéro ne doit pas dépasser 20 caractères'),
  body('type_chambre').isIn(TYPES_CHAMBRE).withMessage('Type invalide (SIMPLE, DOUBLE ou STUDIO)'),
  body('prix_mensuel').notEmpty().withMessage('Le prix mensuel est requis')
    .isInt({ min: 0 }).withMessage('Le prix doit être un entier positif'),
  body('statut').optional().isIn(STATUTS_CHAMBRE).withMessage('Statut invalide'),
];

const bulkChambreValidation = [
  ...idParam, // :id = pavillon
  body('prefixe').optional().isString().isLength({ max: 15 })
    .withMessage('Le préfixe ne doit pas dépasser 15 caractères'),
  body('debut').optional().isInt({ min: 0 }).withMessage('Le début doit être un entier positif'),
  body('nombre').notEmpty().withMessage('Le nombre de chambres est requis')
    .isInt({ min: 1, max: 1000 }).withMessage('Le nombre doit être entre 1 et 1000'),
  body('padding').optional().isInt({ min: 0, max: 8 })
    .withMessage('Le remplissage (zéros) doit être entre 0 et 8'),
  body('type_chambre').isIn(TYPES_CHAMBRE).withMessage('Type invalide (SIMPLE, DOUBLE ou STUDIO)'),
  body('prix_mensuel').notEmpty().withMessage('Le prix mensuel est requis')
    .isInt({ min: 0 }).withMessage('Le prix doit être un entier positif'),
];

module.exports = {
  validate,
  idParam,
  creerPavillonValidation,
  majPavillonValidation,
  creerChambreValidation,
  bulkChambreValidation,
};
