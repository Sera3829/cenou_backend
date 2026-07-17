/**
 * Règles de validation : centres et chambres.
 */
const { body, param } = require('express-validator');
const { validate } = require('./authValidator');

const TYPES_CHAMBRE = ['SIMPLE', 'DOUBLE', 'STUDIO'];
const STATUTS_CHAMBRE = ['DISPONIBLE', 'OCCUPE', 'MAINTENANCE'];

const idParam = [param('id').isInt().withMessage('ID invalide')];

const creerCentreValidation = [
  body('nom').trim().notEmpty().withMessage('Le nom est requis')
    .isLength({ min: 2, max: 100 }).withMessage('Le nom doit contenir entre 2 et 100 caractères'),
  body('ville').trim().notEmpty().withMessage('La ville est requise')
    .isLength({ min: 2, max: 100 }).withMessage('La ville doit contenir entre 2 et 100 caractères'),
  body('adresse').optional({ nullable: true }).trim().isLength({ max: 500 })
    .withMessage('L\'adresse ne doit pas dépasser 500 caractères'),
  body('capacite_totale').optional().isInt({ min: 0 })
    .withMessage('La capacité doit être un entier positif'),
];

const majCentreValidation = [
  ...idParam,
  body('nom').optional().trim().notEmpty().isLength({ min: 2, max: 100 })
    .withMessage('Le nom doit contenir entre 2 et 100 caractères'),
  body('ville').optional().trim().notEmpty().isLength({ min: 2, max: 100 })
    .withMessage('La ville doit contenir entre 2 et 100 caractères'),
  body('adresse').optional({ nullable: true }).trim().isLength({ max: 500 })
    .withMessage('L\'adresse ne doit pas dépasser 500 caractères'),
  body('capacite_totale').optional().isInt({ min: 0 })
    .withMessage('La capacité doit être un entier positif'),
];

const creerChambreValidation = [
  ...idParam, // :id = centre
  body('numero_chambre').trim().notEmpty().withMessage('Le numéro de chambre est requis')
    .isLength({ max: 20 }).withMessage('Le numéro ne doit pas dépasser 20 caractères'),
  body('type_chambre').isIn(TYPES_CHAMBRE)
    .withMessage('Type invalide (SIMPLE, DOUBLE ou STUDIO)'),
  body('prix_mensuel').notEmpty().withMessage('Le prix mensuel est requis')
    .isInt({ min: 0 }).withMessage('Le prix doit être un entier positif'),
  body('statut').optional().isIn(STATUTS_CHAMBRE)
    .withMessage('Statut invalide'),
];

const majChambreValidation = [
  ...idParam, // :id = logement
  body('numero_chambre').optional().trim().notEmpty()
    .isLength({ max: 20 }).withMessage('Le numéro ne doit pas dépasser 20 caractères'),
  body('type_chambre').optional().isIn(TYPES_CHAMBRE)
    .withMessage('Type invalide (SIMPLE, DOUBLE ou STUDIO)'),
  body('prix_mensuel').optional().isInt({ min: 0 })
    .withMessage('Le prix doit être un entier positif'),
  body('statut').optional().isIn(STATUTS_CHAMBRE)
    .withMessage('Statut invalide'),
];

module.exports = {
  validate,
  idParam,
  creerCentreValidation,
  majCentreValidation,
  creerChambreValidation,
  majChambreValidation,
};
