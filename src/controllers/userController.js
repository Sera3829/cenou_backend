/**
 * Contrôleur utilisateur (compte connecté) : traduction HTTP ↔ service.
 * Voir services/userService.js.
 */
const userService = require('../services/userService');
const { repondreErreur } = require('../utils/httpError');

/** GET /api/users/profile */
const getProfile = async (req, res) => {
  try {
    const { user, attribution } = await userService.profil(req.user.id, req.user.role);
    res.json({ user, attribution });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la récupération du profil');
  }
};

/** PUT /api/users/profile */
const updateProfile = async (req, res) => {
  try {
    const user = await userService.mettreAJourProfil(req.user.id, req.body);
    res.json({ message: 'Profil mis à jour avec succès', user });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la mise à jour du profil');
  }
};

/** PUT /api/users/change-password */
const changePassword = async (req, res) => {
  try {
    await userService.changerMotDePasse(req.user.id, req.body);
    res.json({ message: 'Mot de passe changé avec succès' });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors du changement de mot de passe');
  }
};

/** GET /api/users/attributions */
const getAttributionsHistory = async (req, res) => {
  try {
    const attributions = await userService.historiqueAttributions(req.user.id, req.user.role);
    res.json({ attributions, total: attributions.length });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la récupération de l\'historique');
  }
};

/** GET /api/users/stats */
const getUserStats = async (req, res) => {
  try {
    const stats = await userService.statistiques(req.user.id, req.user.role);
    res.json({ stats });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la récupération des statistiques');
  }
};

/** DELETE /api/users/account */
const deactivateAccount = async (req, res) => {
  try {
    await userService.desactiverSonCompte(req.user.id, req.body);
    res.json({ message: 'Compte désactivé avec succès' });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la désactivation du compte');
  }
};

module.exports = {
  getProfile,
  updateProfile,
  changePassword,
  getAttributionsHistory,
  getUserStats,
  deactivateAccount,
};
