/**
 * Accès aux données : centres et étudiants d'un centre.
 */
const db = require('../config/database');

const liste = async (exec = db) => {
  const r = await exec.query(
    `SELECT id, nom, ville, adresse, capacite_totale, created_at
     FROM centres ORDER BY nom ASC`
  );
  return r.rows;
};

/** Liste enrichie de statistiques (logements, occupés, disponibles, résidents) */
const listeAvecStats = async (exec = db) => {
  const r = await exec.query(
    `SELECT
       c.id, c.nom, c.ville, c.adresse, c.capacite_totale, c.created_at,
       COUNT(l.id)                                              AS total_logements,
       COUNT(l.id) FILTER (WHERE l.statut = 'OCCUPE')          AS logements_occupes,
       COUNT(l.id) FILTER (WHERE l.statut = 'DISPONIBLE')      AS logements_disponibles,
       COUNT(l.id) FILTER (WHERE l.statut = 'MAINTENANCE')     AS logements_maintenance,
       COUNT(DISTINCT a.utilisateur_id) FILTER (WHERE a.statut = 'ACTIVE') AS residents
     FROM centres c
     LEFT JOIN logements l ON l.centre_id = c.id
     LEFT JOIN attributions a ON a.logement_id = l.id AND a.statut = 'ACTIVE'
     GROUP BY c.id
     ORDER BY c.nom ASC`
  );
  return r.rows;
};

const creer = async ({ nom, ville, adresse, capaciteTotale }, exec = db) => {
  const r = await exec.query(
    `INSERT INTO centres (nom, ville, adresse, capacite_totale)
     VALUES ($1, $2, $3, $4)
     RETURNING id, nom, ville, adresse, capacite_totale, created_at`,
    [nom, ville, adresse || null, capaciteTotale || 0]
  );
  return r.rows[0];
};

const mettreAJour = async (centreId, { nom, ville, adresse, capaciteTotale }, exec = db) => {
  const updates = [];
  const params = [];
  let i = 1;
  if (nom !== undefined) { updates.push(`nom = $${i}`); params.push(nom); i++; }
  if (ville !== undefined) { updates.push(`ville = $${i}`); params.push(ville); i++; }
  if (adresse !== undefined) { updates.push(`adresse = $${i}`); params.push(adresse); i++; }
  if (capaciteTotale !== undefined) { updates.push(`capacite_totale = $${i}`); params.push(capaciteTotale); i++; }
  if (updates.length === 0) return parId(centreId, exec);
  params.push(centreId);
  const r = await exec.query(
    `UPDATE centres SET ${updates.join(', ')} WHERE id = $${i}
     RETURNING id, nom, ville, adresse, capacite_totale, created_at`,
    params
  );
  return r.rows[0] || null;
};

const supprimer = async (centreId, exec = db) => {
  const r = await exec.query('DELETE FROM centres WHERE id = $1 RETURNING id', [centreId]);
  return r.rows.length > 0;
};

/** Nombre de résidents actifs dans un centre (garde-fou suppression) */
const nbResidentsActifs = async (centreId, exec = db) => {
  const r = await exec.query(
    `SELECT COUNT(*)::int AS n
     FROM attributions a
     JOIN logements l ON a.logement_id = l.id
     WHERE l.centre_id = $1 AND a.statut = 'ACTIVE'`,
    [centreId]
  );
  return r.rows[0].n;
};

const parId = async (centreId, exec = db) => {
  const r = await exec.query(
    `SELECT id, nom, ville, adresse, capacite_totale, created_at
     FROM centres WHERE id = $1`,
    [centreId]
  );
  return r.rows[0] || null;
};

const etudiantsDuCentre = async (centreId, exec = db) => {
  const r = await exec.query(
    `SELECT DISTINCT ON (u.id)
       u.id, u.matricule, u.nom, u.prenom, u.email, u.telephone, u.statut,
       c.nom as centre_nom, l.numero_chambre
     FROM utilisateurs u
     INNER JOIN attributions a ON u.id = a.utilisateur_id
     INNER JOIN logements l ON a.logement_id = l.id
     INNER JOIN centres c ON l.centre_id = c.id
     WHERE c.id = $1
       AND u.role = 'ETUDIANT'
       AND u.statut = 'ACTIF'
       AND a.statut = 'ACTIVE'
     ORDER BY u.id, a.date_debut DESC`,
    [centreId]
  );
  return r.rows;
};

/** IDs des utilisateurs ayant une attribution active dans un centre */
const idsUtilisateursActifs = async (centreId, exec = db) => {
  const r = await exec.query(
    `SELECT DISTINCT a.utilisateur_id
     FROM attributions a
     JOIN logements l ON a.logement_id = l.id
     WHERE l.centre_id = $1 AND a.statut = 'ACTIVE'`,
    [centreId]
  );
  return r.rows.map((row) => row.utilisateur_id);
};

module.exports = {
  liste, parId, etudiantsDuCentre, idsUtilisateursActifs,
  listeAvecStats, creer, mettreAJour, supprimer, nbResidentsActifs,
};
