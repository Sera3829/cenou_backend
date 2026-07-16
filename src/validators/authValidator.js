const { body, validationResult } = require('express-validator');

/**
 * Middleware pour vérifier les erreurs de validation
 */
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
 * Règles de validation pour l'inscription
 */
const registerValidation = [
  body('matricule')
    .trim()
    .notEmpty().withMessage('Le matricule est requis')
    .isLength({ min: 5, max: 50 }).withMessage('Le matricule doit contenir entre 5 et 50 caractères')
    .matches(/^[A-Z0-9]+$/).withMessage('Le matricule ne peut contenir que des lettres majuscules et chiffres'),
  
  body('nom')
    .trim()
    .notEmpty().withMessage('Le nom est requis')
    .isLength({ min: 2, max: 100 }).withMessage('Le nom doit contenir entre 2 et 100 caractères'),
  
  body('prenom')
    .trim()
    .notEmpty().withMessage('Le prénom est requis')
    .isLength({ min: 2, max: 100 }).withMessage('Le prénom doit contenir entre 2 et 100 caractères'),
  
  body('email')
    .trim()
    .notEmpty().withMessage('L\'email est requis')
    .isEmail().withMessage('Email invalide')
    .normalizeEmail(),
  
  body('telephone')
    .optional()
    .trim()
    .matches(/^\+?[0-9]{8,20}$/).withMessage('Numéro de téléphone invalide'),
  
  body('mot_de_passe')
    .notEmpty().withMessage('Le mot de passe est requis')
    .isLength({ min: 6 }).withMessage('Le mot de passe doit contenir au moins 6 caractères')
    .matches(/[A-Z]/).withMessage('Le mot de passe doit contenir au moins une majuscule')
    .matches(/[a-z]/).withMessage('Le mot de passe doit contenir au moins une minuscule')
    .matches(/[0-9]/).withMessage('Le mot de passe doit contenir au moins un chiffre'),
  
  body('confirmation_mot_de_passe')
    .notEmpty().withMessage('La confirmation du mot de passe est requise')
    .custom((value, { req }) => {
      if (value !== req.body.mot_de_passe) {
        throw new Error('Les mots de passe ne correspondent pas');
      }
      return true;
    }),
];

/**
 * Règles de validation pour la connexion
 */
const loginValidation = [
  body('identifiant')
    .trim()
    .notEmpty().withMessage('L\'identifiant (matricule ou email) est requis'),
  
  body('mot_de_passe')
    .notEmpty().withMessage('Le mot de passe est requis'),
];

/**
 * Règles de validation pour la mise à jour du profil
 */
const updateProfileValidation = [
  body('email')
    .optional()
    .trim()
    .isEmail().withMessage('Email invalide')
    .normalizeEmail(),
  
  body('telephone')
    .optional()
    .trim()
    .matches(/^\+?[0-9]{8,20}$/).withMessage('Numéro de téléphone invalide'),
];

/**
 * Règles de validation pour le changement de mot de passe
 */
const changePasswordValidation = [
  body('ancien_mot_de_passe')
    .notEmpty().withMessage('L\'ancien mot de passe est requis'),
  
  body('nouveau_mot_de_passe')
    .notEmpty().withMessage('Le nouveau mot de passe est requis')
    .isLength({ min: 6 }).withMessage('Le mot de passe doit contenir au moins 6 caractères')
    .matches(/[A-Z]/).withMessage('Le mot de passe doit contenir au moins une majuscule')
    .matches(/[a-z]/).withMessage('Le mot de passe doit contenir au moins une minuscule')
    .matches(/[0-9]/).withMessage('Le mot de passe doit contenir au moins un chiffre'),
  
  body('confirmation_nouveau_mot_de_passe')
    .notEmpty().withMessage('La confirmation du nouveau mot de passe est requise')
    .custom((value, { req }) => {
      if (value !== req.body.nouveau_mot_de_passe) {
        throw new Error('Les mots de passe ne correspondent pas');
      }
      return true;
    }),
];

module.exports = {
  validate,
  registerValidation,
  loginValidation,
  updateProfileValidation,
  changePasswordValidation,
};
