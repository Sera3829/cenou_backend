/**
 * Contrôleur admin (dashboard + rapports) : traduction HTTP ↔ services.
 * Voir services/adminService.js. La création d'annonce délègue au domaine
 * annonces (services/annonceService).
 */
const adminService = require('../services/adminService');
const annonceService = require('../services/annonceService');
const { getCentreScope } = require('../middlewares/authMiddleware');
const { repondreErreur } = require('../utils/httpError');
const { rapportFinancierCsv, rapportUtilisateursCsv } = require('../utils/csvExporter');

/** GET /api/admin/dashboard/stats */
exports.getDashboardStats = async (req, res) => {
  try {
    const data = await adminService.statistiques(getCentreScope(req));
    res.json({ success: true, data });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la récupération des statistiques');
  }
};

/** GET /api/admin/dashboard/charts */
exports.getChartsData = async (req, res) => {
  try {
    const data = await adminService.graphiques(req.query, getCentreScope(req));
    res.json({ success: true, data });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la récupération des données graphiques');
  }
};

/** GET /api/admin/dashboard/recent-activity */
exports.getRecentActivity = async (req, res) => {
  try {
    const data = await adminService.activiteRecente(req.query, getCentreScope(req));
    res.json({ success: true, data });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la récupération de l\'activité récente');
  }
};

/** GET /api/admin/reports/financial */
exports.getFinancialReport = async (req, res) => {
  try {
    const data = await adminService.rapportFinancier(req.query, getCentreScope(req), req.user?.id);

    if (req.query.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=rapport_financier.csv');
      return res.send(rapportFinancierCsv(data));
    }
    if (req.query.format === 'pdf') {
      return res.status(501).json({ success: false, error: 'Format PDF non implémenté pour le moment' });
    }
    res.json({ success: true, data });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la génération du rapport financier');
  }
};

/** GET /api/admin/reports/users */
exports.getUsersReport = async (req, res) => {
  try {
    const data = await adminService.rapportUtilisateurs(req.query, getCentreScope(req));

    if (req.query.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=rapport_utilisateurs.csv');
      return res.send(rapportUtilisateursCsv(data));
    }
    res.json({ success: true, data });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la génération du rapport utilisateurs');
  }
};

/**
 * POST /api/admin/annonces
 * Délègue au domaine annonces (plus de logique dupliquée ici).
 */
exports.createAnnouncement = async (req, res) => {
  try {
    const { annonce } = await annonceService.creer(req.user.id, req.body);
    res.status(201).json({ success: true, data: annonce, message: 'Annonce créée avec succès' });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la création de l\'annonce');
  }
};
