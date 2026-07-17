/**
 * Contrôleur centres : traduction HTTP ↔ repository/service.
 * Lecture : ADMIN + GESTIONNAIRE. Écriture (gestion) : ADMIN uniquement.
 */
const centreRepository = require('../repositories/centreRepository');
const centreService = require('../services/centreService');
const { HttpError, repondreErreur } = require('../utils/httpError');

// ── Lecture (existant) ───────────────────────────────────────────────────

/** GET /api/centres */
const liste = async (req, res) => {
  try {
    const data = await centreRepository.liste();
    res.json({ success: true, data, count: data.length });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la récupération des centres');
  }
};

/** GET /api/centres/:id */
const detail = async (req, res) => {
  try {
    const centre = await centreRepository.parId(req.params.id);
    if (!centre) throw new HttpError(404, 'Centre non trouvé');
    res.json({ success: true, data: centre });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la récupération du centre');
  }
};

/** GET /api/centres/:id/etudiants */
const etudiants = async (req, res) => {
  try {
    const data = await centreRepository.etudiantsDuCentre(req.params.id);
    res.json({ success: true, data, count: data.length });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la récupération des étudiants');
  }
};

// ── Administration des centres (ADMIN) ───────────────────────────────────

/** GET /api/centres/admin/all — liste enrichie de stats d'occupation */
const listeAdmin = async (req, res) => {
  try {
    const data = await centreService.liste();
    res.json({ success: true, data, count: data.length });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la récupération des centres');
  }
};

/** POST /api/centres */
const creer = async (req, res) => {
  try {
    const centre = await centreService.creer(req.body);
    res.status(201).json({ success: true, data: centre, message: 'Centre créé avec succès' });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la création du centre');
  }
};

/** PUT /api/centres/:id */
const mettreAJour = async (req, res) => {
  try {
    const centre = await centreService.mettreAJour(req.params.id, req.body);
    res.json({ success: true, data: centre, message: 'Centre mis à jour avec succès' });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la mise à jour du centre');
  }
};

/** DELETE /api/centres/:id */
const supprimer = async (req, res) => {
  try {
    await centreService.supprimer(req.params.id);
    res.json({ success: true, message: 'Centre supprimé avec succès' });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la suppression du centre');
  }
};

// ── Chambres d'un centre (ADMIN) ─────────────────────────────────────────

/** GET /api/centres/:id/logements */
const chambres = async (req, res) => {
  try {
    const data = await centreService.listerChambres(req.params.id);
    res.json({ success: true, data, count: data.length });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la récupération des chambres');
  }
};

/** POST /api/centres/:id/logements */
const creerChambre = async (req, res) => {
  try {
    const chambre = await centreService.creerChambre(req.params.id, req.body);
    res.status(201).json({ success: true, data: chambre, message: 'Chambre créée avec succès' });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la création de la chambre');
  }
};

/** PUT /api/logements/:id */
const mettreAJourChambre = async (req, res) => {
  try {
    const chambre = await centreService.mettreAJourChambre(req.params.id, req.body);
    res.json({ success: true, data: chambre, message: 'Chambre mise à jour avec succès' });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la mise à jour de la chambre');
  }
};

/** DELETE /api/logements/:id */
const supprimerChambre = async (req, res) => {
  try {
    await centreService.supprimerChambre(req.params.id);
    res.json({ success: true, message: 'Chambre supprimée avec succès' });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la suppression de la chambre');
  }
};

module.exports = {
  liste,
  detail,
  etudiants,
  listeAdmin,
  creer,
  mettreAJour,
  supprimer,
  chambres,
  creerChambre,
  mettreAJourChambre,
  supprimerChambre,
};
