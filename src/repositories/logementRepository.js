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

/** Chambres d'un centre, avec l'occupant actif éventuel (pour l'admin) */
const logementsDuCentre = async (centreId, exec = db) => {
  const r = await exec.query(
    `SELECT l.id, l.numero_chambre, l.type_chambre,
            l.prix_mensuel::integer as prix_mensuel, l.statut, l.created_at,
            u.id AS occupant_id, u.matricule AS occupant_matricule,
            u.nom AS occupant_nom, u.prenom AS occupant_prenom
     FROM logements l
     LEFT JOIN attributions a ON a.logement_id = l.id AND a.statut = 'ACTIVE'
     LEFT JOIN utilisateurs u ON a.utilisateur_id = u.id
     WHERE l.centre_id = $1
     ORDER BY l.numero_chambre ASC`,
    [centreId]
  );
  return r.rows;
};

const numeroExisteDansCentre = async (centreId, numero, exclureId = null, exec = db) => {
  const r = exclureId
    ? await exec.query(
        'SELECT id FROM logements WHERE centre_id = $1 AND numero_chambre = $2 AND id != $3',
        [centreId, numero, exclureId])
    : await exec.query(
        'SELECT id FROM logements WHERE centre_id = $1 AND numero_chambre = $2',
        [centreId, numero]);
  return r.rows.length > 0;
};

const creerLogement = async (
  { centreId, pavillonId, numeroChambre, typeChambre, prixMensuel, statut },
  exec = db
) => {
  const r = await exec.query(
    `INSERT INTO logements (centre_id, pavillon_id, numero_chambre, type_chambre, prix_mensuel, statut)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, centre_id, pavillon_id, numero_chambre, type_chambre,
               prix_mensuel::integer as prix_mensuel, statut, created_at`,
    [centreId, pavillonId || null, numeroChambre, typeChambre, prixMensuel, statut || 'DISPONIBLE']
  );
  return r.rows[0];
};

/**
 * Création en masse de chambres dans un pavillon.
 * @param numeros liste de numéros déjà générés (incrémentation faite en amont)
 * Insère en une requête ; ignore les numéros déjà présents dans le centre
 * (contrainte UNIQUE(centre_id, numero_chambre)). Retourne les chambres créées.
 */
const creerLogementsEnMasse = async (
  { centreId, pavillonId, numeros, typeChambre, prixMensuel },
  exec = db
) => {
  if (numeros.length === 0) return [];
  const values = [];
  const params = [centreId, pavillonId, typeChambre, prixMensuel];
  let i = params.length + 1;
  for (const numero of numeros) {
    values.push(`($1, $2, $${i}, $3, $4, 'DISPONIBLE')`);
    params.push(numero);
    i++;
  }
  const r = await exec.query(
    `INSERT INTO logements (centre_id, pavillon_id, numero_chambre, type_chambre, prix_mensuel, statut)
     VALUES ${values.join(', ')}
     ON CONFLICT (centre_id, numero_chambre) DO NOTHING
     RETURNING id, numero_chambre, type_chambre, prix_mensuel::integer as prix_mensuel, statut`,
    params
  );
  return r.rows;
};

/** Chambres d'un pavillon, avec l'occupant actif éventuel (pour l'admin) */
const logementsDuPavillon = async (pavillonId, exec = db) => {
  const r = await exec.query(
    `SELECT l.id, l.numero_chambre, l.type_chambre,
            l.prix_mensuel::integer as prix_mensuel, l.statut, l.created_at,
            u.id AS occupant_id, u.matricule AS occupant_matricule,
            u.nom AS occupant_nom, u.prenom AS occupant_prenom
     FROM logements l
     LEFT JOIN attributions a ON a.logement_id = l.id AND a.statut = 'ACTIVE'
     LEFT JOIN utilisateurs u ON a.utilisateur_id = u.id
     WHERE l.pavillon_id = $1
     ORDER BY l.numero_chambre ASC`,
    [pavillonId]
  );
  return r.rows;
};

const mettreAJourLogement = async (logementId, champs, exec = db) => {
  const updates = [];
  const params = [];
  let i = 1;
  if (champs.numeroChambre !== undefined) { updates.push(`numero_chambre = $${i}`); params.push(champs.numeroChambre); i++; }
  if (champs.typeChambre !== undefined) { updates.push(`type_chambre = $${i}`); params.push(champs.typeChambre); i++; }
  if (champs.prixMensuel !== undefined) { updates.push(`prix_mensuel = $${i}`); params.push(champs.prixMensuel); i++; }
  if (champs.statut !== undefined) { updates.push(`statut = $${i}`); params.push(champs.statut); i++; }
  if (updates.length === 0) return logementParId(logementId, exec);
  params.push(logementId);
  const r = await exec.query(
    `UPDATE logements SET ${updates.join(', ')} WHERE id = $${i}
     RETURNING id, centre_id, numero_chambre, type_chambre,
               prix_mensuel::integer as prix_mensuel, statut, created_at`,
    params
  );
  return r.rows[0] || null;
};

const supprimerLogement = async (logementId, exec = db) => {
  const r = await exec.query('DELETE FROM logements WHERE id = $1 RETURNING id', [logementId]);
  return r.rows.length > 0;
};

/** Statut brut d'un logement (garde-fou suppression/édition) */
const statutLogement = async (logementId, exec = db) => {
  const r = await exec.query('SELECT id, centre_id, statut FROM logements WHERE id = $1', [logementId]);
  return r.rows[0] || null;
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
  logementsDuCentre,
  numeroExisteDansCentre,
  creerLogement,
  creerLogementsEnMasse,
  logementsDuPavillon,
  mettreAJourLogement,
  supprimerLogement,
  statutLogement,
};
