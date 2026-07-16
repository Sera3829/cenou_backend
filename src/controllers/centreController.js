/**
 * Contrôleur centres : traduction HTTP ↔ repository.
 * (Domaine simple en lecture seule : pas de service dédié.)
 */
const centreRepository = require('../repositories/centreRepository');
const { HttpError, repondreErreur } = require('../utils/httpError');

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

module.exports = { liste, detail, etudiants };
