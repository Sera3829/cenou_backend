/**
 * Accès aux données : utilisateurs.
 * Chaque fonction accepte un exécuteur optionnel (client transactionnel) ;
 * par défaut, le pool partagé.
 */
const db = require('../config/database');

const existeMatricule = async (matricule, exec = db) => {
  const r = await exec.query('SELECT id FROM utilisateurs WHERE matricule = $1', [matricule]);
  return r.rows.length > 0;
};

const existeEmail = async (email, excludeId = null, exec = db) => {
  const r = excludeId
    ? await exec.query('SELECT id FROM utilisateurs WHERE email = $1 AND id != $2', [email, excludeId])
    : await exec.query('SELECT id FROM utilisateurs WHERE email = $1', [email]);
  return r.rows.length > 0;
};

/** Profil complet (avec attribution active) par identifiant matricule/email — pour le login */
const trouverPourConnexion = async (identifiant, exec = db) => {
  const r = await exec.query(
    `SELECT
      u.id, u.matricule, u.nom, u.prenom, u.email, u.telephone,
      u.mot_de_passe, u.role, u.statut,
      l.numero_chambre,
      l.type_chambre,
      l.prix_mensuel::integer AS loyer_mensuel,
      c.nom AS nom_centre,
      c.ville,
      a.date_debut,
      a.date_fin,
      a.statut AS statut_attribution
     FROM utilisateurs u
     LEFT JOIN attributions a ON u.id = a.utilisateur_id AND a.statut = 'ACTIVE'
     LEFT JOIN logements l ON a.logement_id = l.id
     LEFT JOIN centres c ON l.centre_id = c.id
     WHERE (u.matricule = $1 OR u.email = $1)`,
    [identifiant]
  );
  return r.rows[0] || null;
};

/** Profil complet (avec attribution active) par id — pour /auth/me */
const trouverProfilComplet = async (userId, exec = db) => {
  const r = await exec.query(
    `SELECT
      u.id, u.matricule, u.nom, u.prenom, u.email, u.telephone,
      u.role, u.statut, u.created_at,
      l.numero_chambre,
      l.type_chambre,
      l.prix_mensuel::integer AS loyer_mensuel,
      c.nom AS nom_centre,
      c.ville,
      a.date_debut,
      a.date_fin,
      a.statut AS statut_attribution
     FROM utilisateurs u
     LEFT JOIN attributions a ON u.id = a.utilisateur_id AND a.statut = 'ACTIVE'
     LEFT JOIN logements l ON a.logement_id = l.id
     LEFT JOIN centres c ON l.centre_id = c.id
     WHERE u.id = $1`,
    [userId]
  );
  return r.rows[0] || null;
};

const insererEtudiant = async ({ matricule, nom, prenom, email, telephone, motDePasseHache }, exec = db) => {
  const r = await exec.query(
    `INSERT INTO utilisateurs (matricule, nom, prenom, email, telephone, mot_de_passe, role, statut)
     VALUES ($1, $2, $3, $4, $5, $6, 'ETUDIANT', 'ACTIF')
     RETURNING id, matricule, nom, prenom, email, telephone, role, statut, created_at`,
    [matricule, nom, prenom, email, telephone || null, motDePasseHache]
  );
  return r.rows[0];
};

const insererParAdmin = async (
  { matricule, nom, prenom, email, telephone, motDePasseHache, role, statut, creePar, centreId },
  exec = db
) => {
  const r = await exec.query(
    `INSERT INTO utilisateurs (
       matricule, nom, prenom, email, telephone,
       mot_de_passe, role, statut, created_by, centre_id
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id, matricule, nom, prenom, email, telephone, role, statut, centre_id, created_at`,
    [matricule, nom, prenom, email, telephone || null, motDePasseHache, role, statut, creePar, centreId]
  );
  return r.rows[0];
};

const marquerConnexion = async (userId, exec = db) => {
  await exec.query('UPDATE utilisateurs SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [userId]);
};

const trouverParId = async (userId, exec = db) => {
  const r = await exec.query(
    'SELECT id, matricule, nom, prenom, email, role, statut, centre_id FROM utilisateurs WHERE id = $1',
    [userId]
  );
  return r.rows[0] || null;
};

const desactiver = async (userId, exec = db) => {
  await exec.query(
    `UPDATE utilisateurs SET statut = 'INACTIF', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [userId]
  );
};

// ── Profil / compte de l'utilisateur connecté ────────────────────────────

/** Infos de base (sans hash) pour le profil */
const profilDeBase = async (userId, exec = db) => {
  const r = await exec.query(
    `SELECT u.id, u.matricule, u.nom, u.prenom, u.email, u.telephone,
            u.role, u.statut, u.created_at
     FROM utilisateurs u WHERE u.id = $1`,
    [userId]
  );
  return r.rows[0] || null;
};

const hashMotDePasse = async (userId, exec = db) => {
  const r = await exec.query('SELECT mot_de_passe FROM utilisateurs WHERE id = $1', [userId]);
  return r.rows[0]?.mot_de_passe ?? null;
};

const changerMotDePasse = async (userId, hache, exec = db) => {
  await exec.query(
    'UPDATE utilisateurs SET mot_de_passe = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
    [hache, userId]
  );
};

/** Mise à jour email/téléphone par l'utilisateur lui-même (champs déjà filtrés) */
const mettreAJourProfil = async (userId, champs, exec = db) => {
  const updates = [];
  const values = [];
  let i = 1;
  if (champs.email) { updates.push(`email = $${i}`); values.push(champs.email); i++; }
  if (champs.telephone) { updates.push(`telephone = $${i}`); values.push(champs.telephone); i++; }
  if (updates.length === 0) return null;
  values.push(userId);
  const r = await exec.query(
    `UPDATE utilisateurs SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
     WHERE id = $${i}
     RETURNING id, matricule, nom, prenom, email, telephone, role, statut`,
    values
  );
  return r.rows[0];
};

const statistiquesEtudiant = async (userId, exec = db) => {
  const r = await exec.query(
    `SELECT
       COUNT(DISTINCT a.id) as total_attributions,
       COUNT(DISTINCT p.id) as total_paiements,
       COALESCE(SUM(CASE WHEN p.statut = 'CONFIRME' THEN p.montant ELSE 0 END), 0) as montant_total_paye,
       COUNT(DISTINCT CASE WHEN p.statut = 'EN_ATTENTE' THEN p.id END) as paiements_en_attente,
       COUNT(DISTINCT s.id) as total_signalements,
       COUNT(DISTINCT CASE WHEN s.statut = 'RESOLU' THEN s.id END) as signalements_resolus
     FROM utilisateurs u
     LEFT JOIN attributions a ON u.id = a.utilisateur_id
     LEFT JOIN paiements p ON a.id = p.attribution_id
     LEFT JOIN signalements s ON a.id = s.attribution_id
     WHERE u.id = $1`,
    [userId]
  );
  return r.rows[0];
};

const changerStatut = async (userId, statut, exec = db) => {
  const r = await exec.query(
    `UPDATE utilisateurs SET statut = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2
     RETURNING id, matricule, nom, prenom, email, role, statut, updated_at`,
    [statut, userId]
  );
  return r.rows[0];
};

/** Ligne minimale (id, role, matricule, email) — vérifications admin */
const infosPourAdmin = async (userId, exec = db) => {
  const r = await exec.query(
    'SELECT id, role, matricule, email FROM utilisateurs WHERE id = $1',
    [userId]
  );
  return r.rows[0] || null;
};

// ── Administration : liste, détail ───────────────────────────────────────

/**
 * IDs des utilisateurs correspondant aux filtres.
 * JOINs ajoutés seulement si un filtre centre/recherche l'exige.
 */
const idsFiltres = async ({ role, statut, centre_id, search }, exec = db) => {
  const besoinJoin = Boolean(centre_id || search);
  let sql = besoinJoin
    ? `SELECT DISTINCT u.id
       FROM utilisateurs u
       LEFT JOIN attributions a ON u.id = a.utilisateur_id AND a.statut = 'ACTIVE'
       LEFT JOIN logements l ON a.logement_id = l.id
       LEFT JOIN centres c ON l.centre_id = c.id
       WHERE 1=1`
    : `SELECT DISTINCT u.id FROM utilisateurs u WHERE 1=1`;

  const params = [];
  let i = 1;
  if (role && role !== 'TOUS') { sql += ` AND u.role = $${i}`; params.push(role); i++; }
  if (statut && statut !== 'TOUS') { sql += ` AND u.statut = $${i}`; params.push(statut); i++; }
  if (centre_id) { sql += ` AND c.id = $${i}`; params.push(centre_id); i++; }
  if (search) {
    sql += ` AND (
      u.matricule ILIKE $${i} OR u.nom ILIKE $${i} OR u.prenom ILIKE $${i} OR
      u.email ILIKE $${i} OR l.numero_chambre ILIKE $${i} OR c.nom ILIKE $${i}
    )`;
    params.push(`%${search}%`);
    i++;
  }

  const r = await exec.query(sql, params);
  return r.rows.map((row) => row.id);
};

/** Détails (avec attribution active la plus récente) pour une liste d'IDs */
const detailsPourIds = async (ids, exec = db) => {
  if (ids.length === 0) return [];
  const placeholders = ids.map((_, idx) => `$${idx + 1}`).join(',');
  const r = await exec.query(
    `SELECT
       u.id, u.matricule, u.nom, u.prenom, u.email, u.telephone,
       u.role, u.statut, u.created_at, u.updated_at,
       latest.centre_id, latest.centre_nom, latest.numero_chambre,
       latest.date_debut, latest.date_fin, latest.attribution_statut
     FROM utilisateurs u
     LEFT JOIN LATERAL (
       SELECT c.id as centre_id, c.nom as centre_nom, l.numero_chambre,
              a.date_debut, a.date_fin, a.statut as attribution_statut
       FROM attributions a
       INNER JOIN logements l ON a.logement_id = l.id
       INNER JOIN centres c ON l.centre_id = c.id
       WHERE a.utilisateur_id = u.id AND a.statut = 'ACTIVE'
       ORDER BY a.date_debut DESC
       LIMIT 1
     ) latest ON true
     WHERE u.id IN (${placeholders})
     ORDER BY u.created_at DESC`,
    ids
  );
  return r.rows;
};

/** Étudiants actifs (option filtre centre) — pour sélection dans annonces */
const etudiantsActifs = async (centreId = null, exec = db) => {
  const params = [];
  let centreClause = '';
  if (centreId !== null) {
    centreClause = 'AND l.centre_id = $1';
    params.push(centreId);
  }
  const r = await exec.query(
    `SELECT DISTINCT ON (u.id)
       u.id, u.matricule, u.nom, u.prenom, u.email, u.statut,
       c.nom as centre_nom, l.numero_chambre
     FROM utilisateurs u
     LEFT JOIN attributions a ON u.id = a.utilisateur_id AND a.statut = 'ACTIVE'
     LEFT JOIN logements l ON a.logement_id = l.id
     LEFT JOIN centres c ON l.centre_id = c.id
     WHERE u.role = 'ETUDIANT' AND u.statut = 'ACTIF' ${centreClause}
     ORDER BY u.id, u.nom ASC, u.prenom ASC`,
    params
  );
  return r.rows;
};

/** Détail admin d'un utilisateur (colonnes explicites, jamais le hash) */
const detailAdmin = async (userId, centreId = null, exec = db) => {
  const params = [userId];
  let centreClause = '';
  if (centreId !== null) {
    centreClause = `AND u.role = 'ETUDIANT' AND EXISTS (
      SELECT 1 FROM attributions a2
      JOIN logements l2 ON a2.logement_id = l2.id
      WHERE a2.utilisateur_id = u.id AND a2.statut = 'ACTIVE' AND l2.centre_id = $2
    )`;
    params.push(centreId);
  }
  const r = await exec.query(
    `SELECT
       u.id, u.matricule, u.nom, u.prenom, u.email, u.telephone,
       u.role, u.statut, u.centre_id, u.created_at, u.updated_at,
       c.nom as centre_nom, l.numero_chambre,
       a.date_debut, a.date_fin, a.statut as attribution_statut
     FROM utilisateurs u
     LEFT JOIN attributions a ON u.id = a.utilisateur_id AND a.statut = 'ACTIVE'
     LEFT JOIN logements l ON a.logement_id = l.id
     LEFT JOIN centres c ON l.centre_id = c.id
     WHERE u.id = $1 ${centreClause}`,
    params
  );
  return r.rows[0] || null;
};

const paiementsRecents = async (userId, limite = 10, exec = db) => {
  const r = await exec.query(
    `SELECT p.id, p.montant, p.date_paiement, p.date_echeance,
            p.mode_paiement, p.statut, p.created_at
     FROM paiements p
     JOIN attributions a ON p.attribution_id = a.id
     WHERE a.utilisateur_id = $1
     ORDER BY p.created_at DESC
     LIMIT $2`,
    [userId, limite]
  );
  return r.rows;
};

const signalementsRecents = async (userId, limite = 10, exec = db) => {
  const r = await exec.query(
    `SELECT s.id, s.numero_suivi, s.type_probleme, s.statut,
            s.created_at, s.date_resolution, l.numero_chambre
     FROM signalements s
     JOIN attributions a ON s.attribution_id = a.id
     JOIN logements l ON a.logement_id = l.id
     WHERE a.utilisateur_id = $1
     ORDER BY s.created_at DESC
     LIMIT $2`,
    [userId, limite]
  );
  return r.rows;
};

const statistiquesAdmin = async (userId, exec = db) => {
  const r = await exec.query(
    `SELECT
       COUNT(DISTINCT p.id) as total_paiements,
       COALESCE(SUM(CASE WHEN p.statut = 'CONFIRME' THEN p.montant ELSE 0 END), 0) as montant_total,
       COUNT(DISTINCT s.id) as total_signalements,
       COUNT(DISTINCT CASE WHEN s.statut = 'RESOLU' THEN s.id END) as signalements_resolus
     FROM utilisateurs u
     LEFT JOIN attributions a ON u.id = a.utilisateur_id
     LEFT JOIN paiements p ON a.id = p.attribution_id
     LEFT JOIN signalements s ON a.id = s.attribution_id
     WHERE u.id = $1`,
    [userId]
  );
  return r.rows[0] || {};
};

/** Mise à jour admin (champs déjà filtrés/validés + éventuel centre_id) */
const mettreAJourParAdmin = async (userId, champs, exec = db) => {
  const updates = [];
  const values = [];
  let i = 1;
  for (const col of ['nom', 'prenom', 'email', 'telephone', 'statut']) {
    if (champs[col] !== undefined && champs[col] !== null && champs[col] !== '') {
      updates.push(`${col} = $${i}`); values.push(champs[col]); i++;
    }
  }
  if (champs.centre_id !== undefined) {
    updates.push(`centre_id = $${i}`); values.push(champs.centre_id); i++;
  }
  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(userId);
  await exec.query(`UPDATE utilisateurs SET ${updates.join(', ')} WHERE id = $${i}`, values);
};

const attributionActiveSimple = async (userId, exec = db) => {
  const r = await exec.query(
    `SELECT id, logement_id FROM attributions
     WHERE utilisateur_id = $1 AND statut = 'ACTIVE'`,
    [userId]
  );
  return r.rows[0] || null;
};

module.exports = {
  existeMatricule,
  existeEmail,
  trouverPourConnexion,
  trouverProfilComplet,
  insererEtudiant,
  insererParAdmin,
  marquerConnexion,
  trouverParId,
  desactiver,
  profilDeBase,
  hashMotDePasse,
  changerMotDePasse,
  mettreAJourProfil,
  statistiquesEtudiant,
  changerStatut,
  infosPourAdmin,
  idsFiltres,
  detailsPourIds,
  etudiantsActifs,
  detailAdmin,
  paiementsRecents,
  signalementsRecents,
  statistiquesAdmin,
  mettreAJourParAdmin,
  attributionActiveSimple,
};
