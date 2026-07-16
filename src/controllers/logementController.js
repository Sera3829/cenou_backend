/**
 * Contrôleur logements : traduction HTTP ↔ repository.
 * (Domaine simple en lecture seule : pas de service dédié.)
 */
const logementRepository = require('../repositories/logementRepository');
const { HttpError, repondreErreur } = require('../utils/httpError');

/** GET /api/logements?centre_id=&statut= */
const liste = async (req, res) => {
  try {
    const data = await logementRepository.listeLogements(req.query);
    res.json({ success: true, data, count: data.length });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la récupération des logements');
  }
};

/** GET /api/logements/:id */
const detail = async (req, res) => {
  try {
    const logement = await logementRepository.logementParId(req.params.id);
    if (!logement) throw new HttpError(404, 'Logement non trouvé');
    res.json({ success: true, data: logement });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la récupération du logement');
  }
};

module.exports = { liste, detail };
