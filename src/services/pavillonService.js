/**
 * Logique métier : pavillons et leurs chambres (ADMIN).
 * Hiérarchie Centre → Pavillon → Chambres.
 */
const { HttpError } = require('../utils/httpError');
const centreRepository = require('../repositories/centreRepository');
const pavillonRepository = require('../repositories/pavillonRepository');
const logementRepository = require('../repositories/logementRepository');

const MAX_BULK = 1000; // garde-fou : pas plus de 1000 chambres par lot

// ── Pavillons ──────────────────────────────────────────────────────────────

const lister = async (centreId) => {
  if (!(await centreRepository.parId(centreId))) {
    throw new HttpError(404, 'Centre non trouvé');
  }
  return pavillonRepository.listeDuCentre(centreId);
};

const creer = async (centreId, { nom, capacite }) => {
  if (!(await centreRepository.parId(centreId))) {
    throw new HttpError(404, 'Centre non trouvé');
  }
  if (await pavillonRepository.nomExisteDansCentre(centreId, nom)) {
    throw new HttpError(409, `Le pavillon « ${nom} » existe déjà dans ce centre`);
  }
  return pavillonRepository.creer({ centreId, nom, capacite });
};

const mettreAJour = async (pavillonId, { nom, capacite }) => {
  const pavillon = await pavillonRepository.parId(pavillonId);
  if (!pavillon) throw new HttpError(404, 'Pavillon non trouvé');
  if (nom && await pavillonRepository.nomExisteDansCentre(pavillon.centre_id, nom, pavillonId)) {
    throw new HttpError(409, `Le pavillon « ${nom} » existe déjà dans ce centre`);
  }
  return pavillonRepository.mettreAJour(pavillonId, { nom, capacite });
};

const supprimer = async (pavillonId) => {
  const pavillon = await pavillonRepository.parId(pavillonId);
  if (!pavillon) throw new HttpError(404, 'Pavillon non trouvé');
  const occupees = await pavillonRepository.nbChambresOccupees(pavillonId);
  if (occupees > 0) {
    throw new HttpError(409,
      `Ce pavillon a ${occupees} chambre(s) occupée(s). Libérez-les avant de le supprimer.`);
  }
  await pavillonRepository.supprimer(pavillonId); // cascade sur les chambres vides
};

// ── Chambres d'un pavillon ─────────────────────────────────────────────────

const listerChambres = async (pavillonId) => {
  if (!(await pavillonRepository.parId(pavillonId))) {
    throw new HttpError(404, 'Pavillon non trouvé');
  }
  return logementRepository.logementsDuPavillon(pavillonId);
};

/** Créer une seule chambre dans un pavillon */
const creerChambre = async (pavillonId, { numero_chambre, type_chambre, prix_mensuel, statut }) => {
  const pavillon = await pavillonRepository.parId(pavillonId);
  if (!pavillon) throw new HttpError(404, 'Pavillon non trouvé');
  if (await logementRepository.numeroExisteDansCentre(pavillon.centre_id, numero_chambre)) {
    throw new HttpError(409, `La chambre ${numero_chambre} existe déjà dans ce centre`);
  }
  return logementRepository.creerLogement({
    centreId: pavillon.centre_id,
    pavillonId,
    numeroChambre: numero_chambre,
    typeChambre: type_chambre,
    prixMensuel: prix_mensuel,
    statut,
  });
};

/**
 * Génère les numéros de chambre depuis un préfixe et une plage.
 * Ex : prefixe='C-', debut=1, nombre=3, padding=3 → ['C-001','C-002','C-003']
 */
const genererNumeros = ({ prefixe = '', debut = 1, nombre, padding = 0 }) => {
  const numeros = [];
  for (let k = 0; k < nombre; k++) {
    const n = debut + k;
    const nStr = padding > 0 ? String(n).padStart(padding, '0') : String(n);
    numeros.push(`${prefixe}${nStr}`);
  }
  return numeros;
};

/**
 * Création en masse : génère les numéros (incrémentation auto) et insère
 * en une passe. Les numéros déjà pris dans le centre sont ignorés.
 * @returns { crees, demandes, ignores, chambres }
 */
const creerChambresEnMasse = async (
  pavillonId,
  { prefixe, debut, nombre, padding, type_chambre, prix_mensuel }
) => {
  const pavillon = await pavillonRepository.parId(pavillonId);
  if (!pavillon) throw new HttpError(404, 'Pavillon non trouvé');

  const total = parseInt(nombre);
  if (!Number.isInteger(total) || total < 1 || total > MAX_BULK) {
    throw new HttpError(400, `Le nombre de chambres doit être entre 1 et ${MAX_BULK}`);
  }

  const numeros = genererNumeros({
    prefixe: prefixe || '',
    debut: parseInt(debut) || 1,
    nombre: total,
    padding: parseInt(padding) || 0,
  });

  const chambres = await logementRepository.creerLogementsEnMasse({
    centreId: pavillon.centre_id,
    pavillonId,
    numeros,
    typeChambre: type_chambre,
    prixMensuel: prix_mensuel,
  });

  return {
    demandes: total,
    crees: chambres.length,
    ignores: total - chambres.length, // numéros déjà existants
    chambres,
  };
};

module.exports = {
  lister,
  creer,
  mettreAJour,
  supprimer,
  listerChambres,
  creerChambre,
  creerChambresEnMasse,
  genererNumeros,
};
