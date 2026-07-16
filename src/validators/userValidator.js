/**
 * Règles de validation : utilisateurs (profil + administration).
 */
const { body, param, query } = require('express-validator');
const { validate } = require('./authValidator');

const nomOptionnel = (champ, label) =>
  body(champ)
    .optional()
    .trim()
    .notEmpty().withMessage(`Le ${label} est requis si fourni`)
    .isLength({ min: 2, max: 100 }).withMessage(`Le ${label} doit contenir entre 2 et 100 caractères`);

// ── Administration ───────────────────────────────────────────────────────

const listeValidation = [
  query('role').optional().isIn(['ETUDIANT', 'GESTIONNAIRE', 'ADMIN', 'TOUS'])
    .withMessage('Le rôle doit être: ETUDIANT, GESTIONNAIRE, ADMIN ou TOUS'),
  query('statut').optional().isIn(['ACTIF', 'INACTIF', 'SUSPENDU', 'TOUS'])
    .withMessage('Le statut doit être: ACTIF, INACTIF, SUSPENDU ou TOUS'),
  query('centre_id').optional().isInt().withMessage('L\'ID du centre doit être un nombre entier'),
  query('search').optional().trim().isLength({ min: 2 })
    .withMessage('La recherche doit contenir au moins 2 caractères'),
  query('page').optional().isInt({ min: 1 }).withMessage('Le numéro de page doit être supérieur à 0'),
  query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('La limite doit être entre 1 et 1000'),
];

const idParam = [param('id').isInt().withMessage('L\'ID de l\'utilisateur doit être un nombre entier')];

const creerValidation = [
  body('matricule').trim().notEmpty().withMessage('Le matricule est requis')
    .isLength({ min: 5, max: 50 }).withMessage('Le matricule doit contenir entre 5 et 50 caractères'),
  body('nom').trim().notEmpty().withMessage('Le nom est requis')
    .isLength({ min: 2, max: 100 }).withMessage('Le nom doit contenir entre 2 et 100 caractères'),
  body('prenom').trim().notEmpty().withMessage('Le prénom est requis')
    .isLength({ min: 2, max: 100 }).withMessage('Le prénom doit contenir entre 2 et 100 caractères'),
  body('email').trim().notEmpty().withMessage('L\'email est requis')
    .isEmail().withMessage('Email invalide').normalizeEmail(),
  body('telephone').optional().trim().matches(/^\+?[0-9]{8,20}$/).withMessage('Numéro de téléphone invalide'),
  body('logement_id')
    .if(body('role').equals('ETUDIANT'))
    .notEmpty().withMessage('La chambre est obligatoire pour un étudiant')
    .isInt().withMessage('L\'ID du logement doit être un nombre entier'),
  body('statut').optional().isIn(['ACTIF', 'INACTIF', 'SUSPENDU'])
    .withMessage('Le statut doit être: ACTIF, INACTIF ou SUSPENDU'),
  body('mot_de_passe').optional().isLength({ min: 6 }).withMessage('Le mot de passe doit contenir au moins 6 caractères'),
  body('confirmation_mot_de_passe').optional().custom((value, { req }) => {
    if (req.body.mot_de_passe && value !== req.body.mot_de_passe) {
      throw new Error('Les mots de passe ne correspondent pas');
    }
    return true;
  }),
  body('centre_id').optional().isInt().withMessage('L\'ID du centre doit être un nombre entier'),
  body('date_debut').optional().isISO8601().withMessage('La date de début doit être au format ISO 8601'),
  body('date_fin').optional().isISO8601().withMessage('La date de fin doit être au format ISO 8601'),
];

const mettreAJourValidation = [
  ...idParam,
  nomOptionnel('nom', 'nom'),
  nomOptionnel('prenom', 'prénom'),
  body('email').optional().trim().isEmail().withMessage('Email invalide').normalizeEmail(),
  body('telephone').optional().trim().matches(/^\+?[0-9]{8,20}$/).withMessage('Numéro de téléphone invalide'),
  body('statut').optional().isIn(['ACTIF', 'INACTIF', 'SUSPENDU'])
    .withMessage('Le statut doit être: ACTIF, INACTIF ou SUSPENDU'),
  body('centre_id').optional({ nullable: true }).isInt().withMessage('L\'ID du centre doit être un nombre entier'),
  body('logement_id').optional().isInt().withMessage('L\'ID du logement doit être un nombre entier'),
  body('date_debut').optional().isISO8601().withMessage('La date de début doit être au format ISO 8601'),
  body('date_fin').optional().isISO8601().withMessage('La date de fin doit être au format ISO 8601'),
];

const changerStatutValidation = [
  ...idParam,
  body('statut').isIn(['ACTIF', 'INACTIF', 'SUSPENDU'])
    .withMessage('Le statut doit être: ACTIF, INACTIF ou SUSPENDU'),
];

module.exports = {
  validate,
  listeValidation,
  idParam,
  creerValidation,
  mettreAJourValidation,
  changerStatutValidation,
};
