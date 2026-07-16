/**
 * Contrôleur signalements : traduction HTTP ↔ service.
 * Aucune logique métier ni SQL ici — voir services/signalementService.js.
 */
const signalementService = require('../services/signalementService');
const { getCentreScope } = require('../middlewares/authMiddleware');
const { repondreErreur } = require('../utils/httpError');

/** POST /api/signalements */
const creerSignalement = async (req, res) => {
  try {
    const { signalement, attribution, photoUrls } = await signalementService.creer(
      req.user.id,
      req.body,
      req.files || []
    );

    res.status(201).json({
      message: 'Signalement créé avec succès',
      signalement: {
        id: signalement.id,
        numero_suivi: signalement.numero_suivi,
        type_probleme: signalement.type_probleme,
        description: signalement.description,
        statut: signalement.statut,
        photos: photoUrls,
        photos_count: photoUrls.length,
        created_at: signalement.created_at,
        updated_at: signalement.updated_at || new Date().toISOString(),
        numero_chambre: attribution.numero_chambre,
        nom_centre: attribution.nom_centre,
        commentaire_resolution: null,
        date_resolution: null,
      },
    });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la création du signalement');
  }
};

/** GET /api/signalements */
const getSignalements = async (req, res) => {
  try {
    const signalements = await signalementService.listerPourUtilisateur(req.user.id);
    res.json({
      signalements: signalements.map((s) => ({
        ...s,
        photos_count: s.photos ? s.photos.length : 0,
      })),
      total: signalements.length,
    });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la récupération des signalements');
  }
};

/** GET /api/signalements/:id */
const getSignalementById = async (req, res) => {
  try {
    const signalement = await signalementService.detailPourUtilisateur(req.params.id, req.user.id);
    res.json({ signalement });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la récupération du signalement');
  }
};

/** GET /api/signalements/:id/photos/:photoIndex */
const getSignalementPhoto = async (req, res) => {
  try {
    const url = await signalementService.urlPhoto(
      req.params.id,
      req.user.id,
      parseInt(req.params.photoIndex)
    );
    res.redirect(url);
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la récupération de la photo');
  }
};

// ── Admin ────────────────────────────────────────────────────────────────

/** GET /api/signalements/admin/all */
const getAllSignalements = async (req, res) => {
  try {
    const resultat = await signalementService.listeAdmin(req.query, getCentreScope(req));
    res.json({ success: true, ...resultat });
  } catch (error) {
    repondreErreur(res, error, 'Erreur serveur lors de la récupération des signalements');
  }
};

/** GET /api/signalements/admin/statistics */
const getStatistiquesAdmin = async (req, res) => {
  try {
    const data = await signalementService.statistiquesAdmin(req.query, getCentreScope(req));
    res.json({ success: true, data });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la récupération des statistiques');
  }
};

/** GET /api/signalements/admin/teams */
const getEquipes = async (req, res) => {
  try {
    const data = await signalementService.equipes();
    res.json({ success: true, data });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la récupération des équipes');
  }
};

/** GET /api/signalements/admin/:id */
const getSignalementAdminById = async (req, res) => {
  try {
    const signalement = await signalementService.detailAdmin(req.params.id, getCentreScope(req));
    res.json({ success: true, signalement });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la récupération du signalement');
  }
};

/** PUT /api/signalements/admin/:id/statut */
const updateSignalementStatut = async (req, res) => {
  try {
    const data = await signalementService.changerStatut(
      req.params.id,
      req.body,
      getCentreScope(req)
    );
    res.json({
      message: 'Statut du signalement mis à jour avec succès',
      data,
      success: true,
    });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la mise à jour du statut');
  }
};

/** POST /api/signalements/admin/:id/assign */
const affecterEquipe = async (req, res) => {
  try {
    const data = await signalementService.affecterEquipe(
      req.params.id,
      req.body,
      req.user.id,
      getCentreScope(req)
    );
    res.json({ success: true, data, message: 'Équipe affectée avec succès' });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de l\'affectation de l\'équipe');
  }
};

module.exports = {
  creerSignalement,
  getSignalements,
  getSignalementById,
  getSignalementPhoto,
  getAllSignalements,
  getStatistiquesAdmin,
  getEquipes,
  getSignalementAdminById,
  updateSignalementStatut,
  affecterEquipe,
};
