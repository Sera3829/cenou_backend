/**
 * Contrôleur rapports (PDF/Excel) : traduction HTTP ↔ service.
 * Voir services/rapportService.js.
 */
const rapportService = require('../services/rapportService');
const { getCentreScope } = require('../middlewares/authMiddleware');
const { repondreErreur } = require('../utils/httpError');

/** Applique les en-têtes de téléchargement puis envoie le fichier généré */
const envoyerFichier = (res, { filePath, fileName, contentType }) => {
  res.setHeader('Content-Type', contentType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.download(filePath, fileName, (err) => {
    if (err && !res.headersSent) {
      res.status(500).json({ error: 'Erreur lors du téléchargement du fichier' });
    }
  });
};

/** POST /api/rapports/financier */
const genererRapportFinancier = async (req, res) => {
  try {
    const fichier = await rapportService.genererFinancier(req.body, getCentreScope(req));
    envoyerFichier(res, fichier);
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la génération du rapport financier');
  }
};

/** POST /api/rapports/occupation */
const genererRapportOccupation = async (req, res) => {
  try {
    const fichier = await rapportService.genererOccupation(req.body, getCentreScope(req));
    envoyerFichier(res, fichier);
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la génération du rapport d\'occupation');
  }
};

module.exports = {
  genererRapportFinancier,
  genererRapportOccupation,
};
