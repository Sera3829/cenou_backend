/**
 * Accès aux données : pavillons (regroupement de chambres dans un centre).
 */
const db = require('../config/database');

/** Pavillons d'un centre, avec statistiques d'occupation des chambres */
const listeDuCentre = async (centreId, exec = db) => {
  const r = await exec.query(
    `SELECT
       p.id, p.centre_id, p.nom, p.capacite, p.created_at,
       COUNT(l.id)                                         AS total_logements,
       COUNT(l.id) FILTER (WHERE l.statut = 'OCCUPE')     AS logements_occupes,
       COUNT(l.id) FILTER (WHERE l.statut = 'DISPONIBLE') AS logements_disponibles,
       COUNT(l.id) FILTER (WHERE l.statut = 'MAINTENANCE') AS logements_maintenance
     FROM pavillons p
     LEFT JOIN logements l ON l.pavillon_id = p.id
     WHERE p.centre_id = $1
     GROUP BY p.id
     ORDER BY p.nom ASC`,
    [centreId]
  );
  return r.rows;
};

const parId = async (pavillonId, exec = db) => {
  const r = await exec.query(
    `SELECT id, centre_id, nom, capacite, created_at FROM pavillons WHERE id = $1`,
    [pavillonId]
  );
  return r.rows[0] || null;
};

const nomExisteDansCentre = async (centreId, nom, exclureId = null, exec = db) => {
  const r = exclureId
    ? await exec.query(
        'SELECT id FROM pavillons WHERE centre_id = $1 AND nom = $2 AND id != $3',
        [centreId, nom, exclureId])
    : await exec.query(
        'SELECT id FROM pavillons WHERE centre_id = $1 AND nom = $2',
        [centreId, nom]);
  return r.rows.length > 0;
};

const creer = async ({ centreId, nom, capacite }, exec = db) => {
  const r = await exec.query(
    `INSERT INTO pavillons (centre_id, nom, capacite)
     VALUES ($1, $2, $3)
     RETURNING id, centre_id, nom, capacite, created_at`,
    [centreId, nom, capacite || 0]
  );
  return r.rows[0];
};

const mettreAJour = async (pavillonId, { nom, capacite }, exec = db) => {
  const updates = [];
  const params = [];
  let i = 1;
  if (nom !== undefined) { updates.push(`nom = $${i}`); params.push(nom); i++; }
  if (capacite !== undefined) { updates.push(`capacite = $${i}`); params.push(capacite); i++; }
  if (updates.length === 0) return parId(pavillonId, exec);
  params.push(pavillonId);
  const r = await exec.query(
    `UPDATE pavillons SET ${updates.join(', ')} WHERE id = $${i}
     RETURNING id, centre_id, nom, capacite, created_at`,
    params
  );
  return r.rows[0] || null;
};

const supprimer = async (pavillonId, exec = db) => {
  const r = await exec.query('DELETE FROM pavillons WHERE id = $1 RETURNING id', [pavillonId]);
  return r.rows.length > 0;
};

/** Nombre de chambres occupées dans un pavillon (garde-fou suppression) */
const nbChambresOccupees = async (pavillonId, exec = db) => {
  const r = await exec.query(
    `SELECT COUNT(*)::int AS n FROM logements
     WHERE pavillon_id = $1 AND statut = 'OCCUPE'`,
    [pavillonId]
  );
  return r.rows[0].n;
};

/** Nombre total de chambres d'un pavillon (contrôle de capacité) */
const nbChambres = async (pavillonId, exec = db) => {
  const r = await exec.query(
    `SELECT COUNT(*)::int AS n FROM logements WHERE pavillon_id = $1`,
    [pavillonId]
  );
  return r.rows[0].n;
};

module.exports = {
  listeDuCentre,
  parId,
  nomExisteDansCentre,
  creer,
  mettreAJour,
  supprimer,
  nbChambresOccupees,
  nbChambres,
};
