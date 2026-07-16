/**
 * Contrôleur administration des utilisateurs : traduction HTTP ↔ service.
 * Voir services/userAdminService.js.
 */
const userAdminService = require('../services/userAdminService');
const { getCentreScope } = require('../middlewares/authMiddleware');
const { repondreErreur } = require('../utils/httpError');

/** GET /api/users/admin/all */
const liste = async (req, res) => {
  try {
    const data = await userAdminService.liste(req.query, getCentreScope(req));
    res.json({ success: true, data });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la récupération des utilisateurs');
  }
};

/** GET /api/users/admin/etudiants */
const etudiants = async (req, res) => {
  try {
    const data = await userAdminService.etudiants(getCentreScope(req));
    res.json({ success: true, data, count: data.length });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la récupération des étudiants');
  }
};

/** GET /api/users/admin/:id */
const detail = async (req, res) => {
  try {
    const data = await userAdminService.detail(req.params.id, getCentreScope(req));
    res.json({ success: true, data });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la récupération de l\'utilisateur');
  }
};

/** POST /api/users/admin/create */
const creer = async (req, res) => {
  try {
    const { user, passwordGenerated, temporaryPassword } = await userAdminService.creer(req.user, req.body);
    res.status(201).json({
      success: true,
      data: { user, password_generated: passwordGenerated, temporary_password: temporaryPassword },
      message: 'Utilisateur créé avec succès',
    });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la création de l\'utilisateur');
  }
};

/** PUT /api/users/admin/:id */
const mettreAJour = async (req, res) => {
  try {
    const data = await userAdminService.mettreAJour(req.user, req.params.id, req.body);
    res.json({ success: true, data, message: 'Utilisateur mis à jour avec succès' });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la mise à jour de l\'utilisateur');
  }
};

/** DELETE /api/users/admin/:id */
const supprimer = async (req, res) => {
  try {
    const { matricule } = await userAdminService.supprimer(req.user, req.params.id);
    res.json({ success: true, message: `Utilisateur ${matricule} désactivé (historique conservé)` });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la suppression');
  }
};

/** PUT /api/users/admin/:id/statut */
const changerStatut = async (req, res) => {
  try {
    const user = await userAdminService.changerStatut(req.user, req.params.id, req.body.statut);
    res.json({ success: true, message: 'Statut mis à jour avec succès', data: { user } });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la mise à jour du statut');
  }
};

module.exports = {
  liste,
  etudiants,
  detail,
  creer,
  mettreAJour,
  supprimer,
  changerStatut,
};
