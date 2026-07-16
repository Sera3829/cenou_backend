/**
 * Contrôleur auth : traduction HTTP ↔ service.
 * Aucune logique métier ni SQL ici — voir services/authService.js.
 */
const authService = require('../services/authService');
const { repondreErreur } = require('../utils/httpError');

/**
 * POST /api/auth/register
 */
const register = async (req, res) => {
  try {
    const { matricule, nom, prenom, email, telephone, mot_de_passe } = req.body;

    const { user, attribution, token } = await authService.inscrire({
      matricule, nom, prenom, email, telephone, mot_de_passe,
    });

    res.status(201).json({
      message: 'Inscription réussie',
      user: {
        id: user.id,
        matricule: user.matricule,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
        telephone: user.telephone,
        role: user.role,
        numero_chambre: attribution?.numero_chambre ?? null,
        nom_centre: attribution?.nom_centre ?? null,
        loyer_mensuel: attribution?.loyer_mensuel ?? null,
      },
      token,
    });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de l\'inscription');
  }
};

/**
 * POST /api/auth/login
 */
const login = async (req, res) => {
  try {
    const { identifiant, mot_de_passe } = req.body;
    const plateforme = req.headers['x-platform'] || '';

    const { user, token } = await authService.connecter({ identifiant, mot_de_passe, plateforme });

    res.json({
      message: 'Connexion réussie',
      user: {
        id: user.id,
        matricule: user.matricule,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
        telephone: user.telephone,
        role: user.role,
        numero_chambre: user.numero_chambre,
        nom_centre: user.nom_centre,
        loyer_mensuel: user.loyer_mensuel,
        date_debut: user.date_debut,
        date_fin: user.date_fin,
      },
      token,
    });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la connexion');
  }
};

/**
 * POST /api/auth/logout
 */
const logout = async (req, res) => {
  try {
    await authService.deconnecter(req.user.id);
    res.json({ message: 'Déconnexion réussie' });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la déconnexion');
  }
};

/**
 * GET /api/auth/me
 */
const getMe = async (req, res) => {
  try {
    const tokenCourant = req.headers['authorization']?.replace('Bearer ', '');
    const user = await authService.profil(req.user.id, tokenCourant);
    res.json({ user });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la récupération du profil');
  }
};

/**
 * POST /api/auth/refresh
 */
const refreshToken = async (req, res) => {
  try {
    const token = await authService.rafraichirToken(req.user);
    res.json({ message: 'Token rafraîchi avec succès', token });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors du rafraîchissement du token');
  }
};

module.exports = {
  register,
  login,
  logout,
  getMe,
  refreshToken,
};
