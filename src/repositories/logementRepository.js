/**
 * Accès aux données : logements et attributions.
 */
const db = require('../config/database');

/**
 * Première chambre disponible, verrouillée pour la transaction en cours.
 * FOR UPDATE SKIP LOCKED : deux inscriptions simultanées ne peuvent pas
 * obtenir la même chambre.
 */
const reserverChambreDisponible = async (exec) => {
  const r = await exec.query(`
    SELECT id FROM logements
    WHERE statut = 'DISPONIBLE'
    ORDER BY centre_id ASC, id ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  `);
  return r.rows[0] || null;
};

const changerStatut = async (logementId, statut, exec = db) => {
  await exec.query('UPDATE logements SET statut = $2 WHERE id = $1', [logementId, statut]);
};

const trouverCentreDuLogement = async (logementId, exec = db) => {
  const r = await exec.query('SELECT centre_id FROM logements WHERE id = $1', [logementId]);
  return r.rows[0]?.centre_id ?? null;
};

const infosLogement = async (logementId, exec = db) => {
  const r = await exec.query(
    `SELECT l.numero_chambre, l.type_chambre, l.prix_mensuel::integer as loyer_mensuel,
            c.nom as nom_centre, c.ville
     FROM logements l
     JOIN centres c ON l.centre_id = c.id
     WHERE l.id = $1`,
    [logementId]
  );
  return r.rows[0] || null;
};

/** Liste des logements, filtrable par centre et/ou statut */
const listeLogements = async ({ centre_id, statut }, exec = db) => {
  let sql = `SELECT id, centre_id, numero_chambre, type_chambre,
                    prix_mensuel::integer as prix_mensuel, statut, created_at
             FROM logements WHERE 1=1`;
  const params = [];
  let idx = 1;
  if (centre_id) { sql += ` AND centre_id = $${idx++}`; params.push(parseInt(centre_id)); }
  if (statut) { sql += ` AND statut = $${idx++}`; params.push(statut); }
  sql += ` ORDER BY type_chambre ASC, numero_chambre ASC`;
  const r = await exec.query(sql, params);
  return r.rows;
};

/** Logement détaillé (avec centre) par id */
const logementParId = async (logementId, exec = db) => {
  const r = await exec.query(
    `SELECT l.id, l.centre_id, l.numero_chambre, l.type_chambre,
            l.prix_mensuel::integer as prix_mensuel, l.statut, l.created_at,
            c.nom as centre_nom, c.ville
     FROM logements l
     JOIN centres c ON l.centre_id = c.id
     WHERE l.id = $1`,
    [logementId]
  );
  return r.rows[0] || null;
};

const insererAttribution = async ({ utilisateurId, logementId, dateDebut, dateFin = null }, exec = db) => {
  await exec.query(
    `INSERT INTO attributions (utilisateur_id, logement_id, date_debut, date_fin, statut)
     VALUES ($1, $2, $3, $4, 'ACTIVE')`,
    [utilisateurId, logementId, dateDebut, dateFin]
  );
};

/** Attribution active d'un utilisateur, avec loyer et centre */
const attributionActive = async (utilisateurId, exec = db) => {
  const r = await exec.query(
    `SELECT a.id, a.logement_id, a.date_debut,
            l.prix_mensuel, l.numero_chambre, l.type_chambre, l.centre_id,
            c.nom as nom_centre
     FROM attributions a
     JOIN logements l ON a.logement_id = l.id
     JOIN centres c ON l.centre_id = c.id
     WHERE a.utilisateur_id = $1 AND a.statut = 'ACTIVE'
     LIMIT 1`,
    [utilisateurId]
  );
  return r.rows[0] || null;
};

const attributionsActives = async (utilisateurId, exec = db) => {
  const r = await exec.query(
    `SELECT id, logement_id FROM attributions
     WHERE utilisateur_id = $1 AND statut = 'ACTIVE'`,
    [utilisateurId]
  );
  return r.rows;
};

const terminerAttribution = async (attributionId, exec = db) => {
  await exec.query(
    `UPDATE attributions SET statut = 'TERMINEE', date_fin = CURRENT_DATE,
     updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [attributionId]
  );
};

/** L'utilisateur a-t-il une attribution active dans ce centre ? */
const estDansCentre = async (utilisateurId, centreId, exec = db) => {
  const r = await exec.query(
    `SELECT 1 FROM attributions a
     JOIN logements l ON a.logement_id = l.id
     WHERE a.utilisateur_id = $1 AND a.statut = 'ACTIVE' AND l.centre_id = $2`,
    [utilisateurId, centreId]
  );
  return r.rows.length > 0;
};

const centreExiste = async (centreId, exec = db) => {
  const r = await exec.query('SELECT id FROM centres WHERE id = $1', [centreId]);
  return r.rows.length > 0;
};

/** Attribution active détaillée (pour le profil étudiant) */
const attributionActiveDetaillee = async (utilisateurId, exec = db) => {
  const r = await exec.query(
    `SELECT a.id, a.date_debut, a.date_fin, a.statut as statut_attribution,
            l.numero_chambre, l.type_chambre, l.prix_mensuel, l.statut as statut_logement,
            c.nom as nom_centre, c.ville
     FROM attributions a
     JOIN logements l ON a.logement_id = l.id
     JOIN centres c ON l.centre_id = c.id
     WHERE a.utilisateur_id = $1 AND a.statut = 'ACTIVE'
     ORDER BY a.date_debut DESC
     LIMIT 1`,
    [utilisateurId]
  );
  return r.rows[0] || null;
};

/** Historique complet des attributions d'un utilisateur */
const historiqueAttributions = async (utilisateurId, exec = db) => {
  const r = await exec.query(
    `SELECT a.id, a.date_debut, a.date_fin, a.statut,
            l.numero_chambre, l.type_chambre, l.prix_mensuel,
            c.nom as nom_centre, c.ville, a.created_at
     FROM attributions a
     JOIN logements l ON a.logement_id = l.id
     JOIN centres c ON l.centre_id = c.id
     WHERE a.utilisateur_id = $1
     ORDER BY a.date_debut DESC`,
    [utilisateurId]
  );
  return r.rows;
};

module.exports = {
  reserverChambreDisponible,
  changerStatut,
  trouverCentreDuLogement,
  infosLogement,
  insererAttribution,
  attributionActive,
  attributionsActives,
  terminerAttribution,
  estDansCentre,
  centreExiste,
  attributionActiveDetaillee,
  historiqueAttributions,
  listeLogements,
  logementParId,
};
