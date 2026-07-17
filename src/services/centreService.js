/**
 * Logique métier : administration des centres et de leurs chambres.
 * Réservé aux ADMIN (le contrôle de rôle est fait par la route).
 */
const { HttpError } = require('../utils/httpError');
const centreRepository = require('../repositories/centreRepository');
const logementRepository = require('../repositories/logementRepository');

// ── Centres ──────────────────────────────────────────────────────────────

const liste = () => centreRepository.listeAvecStats();

const detail = async (centreId) => {
  const centre = await centreRepository.parId(centreId);
  if (!centre) throw new HttpError(404, 'Centre non trouvé');
  const logements = await logementRepository.logementsDuCentre(centreId);
  return { ...centre, logements };
};

const creer = ({ nom, ville, adresse, capacite_totale }) =>
  centreRepository.creer({ nom, ville, adresse, capaciteTotale: capacite_totale });

const mettreAJour = async (centreId, { nom, ville, adresse, capacite_totale }) => {
  if (!(await centreRepository.parId(centreId))) {
    throw new HttpError(404, 'Centre non trouvé');
  }
  return centreRepository.mettreAJour(centreId, { nom, ville, adresse, capaciteTotale: capacite_totale });
};

const supprimer = async (centreId) => {
  const centre = await centreRepository.parId(centreId);
  if (!centre) throw new HttpError(404, 'Centre non trouvé');

  // Garde-fou : un centre avec des résidents actifs ne peut pas être supprimé
  // (la suppression cascaderait sur des chambres occupées et bloquerait sur
  // les paiements protégés — mieux vaut un message clair).
  const residents = await centreRepository.nbResidentsActifs(centreId);
  if (residents > 0) {
    throw new HttpError(409,
      `Ce centre compte ${residents} résident(s) actif(s). Réattribuez ou libérez les chambres avant de le supprimer.`);
  }

  await centreRepository.supprimer(centreId); // cascade sur les chambres vides
};

// ── Chambres (logements) ─────────────────────────────────────────────────

const listerChambres = async (centreId) => {
  if (!(await centreRepository.parId(centreId))) {
    throw new HttpError(404, 'Centre non trouvé');
  }
  return logementRepository.logementsDuCentre(centreId);
};

const creerChambre = async (centreId, { numero_chambre, type_chambre, prix_mensuel, statut }) => {
  if (!(await centreRepository.parId(centreId))) {
    throw new HttpError(404, 'Centre non trouvé');
  }
  if (await logementRepository.numeroExisteDansCentre(centreId, numero_chambre)) {
    throw new HttpError(409, `La chambre ${numero_chambre} existe déjà dans ce centre`);
  }
  return logementRepository.creerLogement({
    centreId,
    numeroChambre: numero_chambre,
    typeChambre: type_chambre,
    prixMensuel: prix_mensuel,
    statut,
  });
};

const mettreAJourChambre = async (logementId, { numero_chambre, type_chambre, prix_mensuel, statut }) => {
  const logement = await logementRepository.statutLogement(logementId);
  if (!logement) throw new HttpError(404, 'Chambre non trouvée');

  // Un occupant est en place : on interdit de la repasser DISPONIBLE
  // (l'attribution est la source de vérité du statut occupé).
  if (logement.statut === 'OCCUPE' && statut && statut !== 'OCCUPE') {
    throw new HttpError(409, 'Cette chambre est occupée : libérez l\'attribution avant de changer son statut.');
  }

  if (numero_chambre &&
      await logementRepository.numeroExisteDansCentre(logement.centre_id, numero_chambre, logementId)) {
    throw new HttpError(409, `La chambre ${numero_chambre} existe déjà dans ce centre`);
  }

  return logementRepository.mettreAJourLogement(logementId, {
    numeroChambre: numero_chambre,
    typeChambre: type_chambre,
    prixMensuel: prix_mensuel,
    statut,
  });
};

const supprimerChambre = async (logementId) => {
  const logement = await logementRepository.statutLogement(logementId);
  if (!logement) throw new HttpError(404, 'Chambre non trouvée');
  if (logement.statut === 'OCCUPE') {
    throw new HttpError(409, 'Impossible de supprimer une chambre occupée.');
  }
  await logementRepository.supprimerLogement(logementId);
};

module.exports = {
  liste,
  detail,
  creer,
  mettreAJour,
  supprimer,
  listerChambres,
  creerChambre,
  mettreAJourChambre,
  supprimerChambre,
};
