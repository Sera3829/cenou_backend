/**
 * Contrôleur annonces : traduction HTTP ↔ service.
 * Voir services/annonceService.js.
 */
const annonceService = require('../services/annonceService');
const { repondreErreur } = require('../utils/httpError');

/** POST /api/annonces/send */
const sendAnnonce = async (req, res) => {
  try {
    const data = await annonceService.creer(req.user.id, req.body);
    res.json({ success: true, message: 'Annonce créée avec succès', data });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la création de l\'annonce');
  }
};

/** GET /api/annonces/admin/all */
const getAnnoncesAdmin = async (req, res) => {
  try {
    const data = await annonceService.listeAdmin(req.query);
    res.json({ success: true, message: 'Liste des annonces', data });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la récupération des annonces');
  }
};

/** GET /api/annonces */
const getAnnoncesEtudiant = async (req, res) => {
  try {
    const { annonces, unreadCount } = await annonceService.listePourEtudiant(req.user.id, req.query);
    res.json({ success: true, message: 'Annonces récupérées', data: annonces, unread_count: unreadCount });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la récupération des annonces');
  }
};

/** GET /api/annonces/:annonceId */
const getAnnonceById = async (req, res) => {
  try {
    const annonce = await annonceService.detail(req.params.annonceId, req.user.id, req.user.role);
    res.json({ success: true, message: 'Annonce récupérée', annonce });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la récupération de l\'annonce');
  }
};

/** PUT /api/annonces/admin/:annonceId/statut */
const updateAnnonceStatut = async (req, res) => {
  try {
    const annonce = await annonceService.changerStatut(req.params.annonceId, req.body.statut);
    res.json({ success: true, message: `Annonce ${annonce.statut.toLowerCase()} avec succès`, annonce });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la mise à jour du statut');
  }
};

/** DELETE /api/annonces/:annonceId */
const deleteAnnonce = async (req, res) => {
  try {
    await annonceService.supprimer(req.params.annonceId);
    res.json({ success: true, message: 'Annonce supprimée avec succès' });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la suppression de l\'annonce');
  }
};

module.exports = {
  sendAnnonce,
  getAnnoncesAdmin,
  getAnnoncesEtudiant,
  updateAnnonceStatut,
  deleteAnnonce,
  getAnnonceById,
};
