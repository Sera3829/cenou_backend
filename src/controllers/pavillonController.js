/**
 * Contrôleur pavillons et leurs chambres : traduction HTTP ↔ service.
 * Réservé ADMIN (contrôle de rôle par la route).
 */
const pavillonService = require('../services/pavillonService');
const { repondreErreur } = require('../utils/httpError');

/** GET /api/centres/:id/pavillons */
const liste = async (req, res) => {
  try {
    const data = await pavillonService.lister(req.params.id);
    res.json({ success: true, data, count: data.length });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la récupération des pavillons');
  }
};

/** POST /api/centres/:id/pavillons */
const creer = async (req, res) => {
  try {
    const pavillon = await pavillonService.creer(req.params.id, req.body);
    res.status(201).json({ success: true, data: pavillon, message: 'Pavillon créé avec succès' });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la création du pavillon');
  }
};

/** PUT /api/pavillons/:id */
const mettreAJour = async (req, res) => {
  try {
    const pavillon = await pavillonService.mettreAJour(req.params.id, req.body);
    res.json({ success: true, data: pavillon, message: 'Pavillon mis à jour avec succès' });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la mise à jour du pavillon');
  }
};

/** DELETE /api/pavillons/:id */
const supprimer = async (req, res) => {
  try {
    await pavillonService.supprimer(req.params.id);
    res.json({ success: true, message: 'Pavillon supprimé avec succès' });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la suppression du pavillon');
  }
};

/** GET /api/pavillons/:id/logements */
const chambres = async (req, res) => {
  try {
    const data = await pavillonService.listerChambres(req.params.id);
    res.json({ success: true, data, count: data.length });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la récupération des chambres');
  }
};

/** POST /api/pavillons/:id/logements */
const creerChambre = async (req, res) => {
  try {
    const chambre = await pavillonService.creerChambre(req.params.id, req.body);
    res.status(201).json({ success: true, data: chambre, message: 'Chambre créée avec succès' });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la création de la chambre');
  }
};

/** POST /api/pavillons/:id/logements/bulk — création en masse */
const creerChambresEnMasse = async (req, res) => {
  try {
    const resultat = await pavillonService.creerChambresEnMasse(req.params.id, req.body);
    res.status(201).json({
      success: true,
      data: resultat,
      message: `${resultat.crees} chambre(s) créée(s)` +
        (resultat.ignores > 0 ? `, ${resultat.ignores} ignorée(s) (numéros déjà utilisés)` : ''),
    });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la création en masse');
  }
};

module.exports = {
  liste,
  creer,
  mettreAJour,
  supprimer,
  chambres,
  creerChambre,
  creerChambresEnMasse,
};
