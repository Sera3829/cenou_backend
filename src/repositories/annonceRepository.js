/**
 * Accès aux données : annonces et destinataires.
 */
const db = require('../config/database');

const creer = async (
  { titre, contenu, cible, centreId, statut, createdBy, datePublication, dateExpiration },
  exec = db
) => {
  const r = await exec.query(
    `INSERT INTO annonces
       (titre, contenu, cible, centre_id, statut, created_by, date_publication, date_expiration)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [titre, contenu, cible, centreId || null, statut, createdBy,
     datePublication || new Date().toISOString(), dateExpiration || null]
  );
  return r.rows[0];
};

// ── Résolution des destinataires selon la cible ──────────────────────────

const idsTousEtudiants = async (exec = db) => {
  const r = await exec.query(
    `SELECT id FROM utilisateurs WHERE role = 'ETUDIANT' AND statut = 'ACTIF'`
  );
  return r.rows.map((row) => row.id);
};

const idsEtudiantsDuCentre = async (centreId, exec = db) => {
  const r = await exec.query(
    `SELECT DISTINCT u.id
     FROM utilisateurs u
     INNER JOIN attributions a ON u.id = a.utilisateur_id
     INNER JOIN logements l ON a.logement_id = l.id
     WHERE l.centre_id = $1 AND u.role = 'ETUDIANT'
       AND u.statut = 'ACTIF' AND a.statut = 'ACTIVE'`,
    [centreId]
  );
  return r.rows.map((row) => row.id);
};

const idsEtudiantsParmi = async (userIds, exec = db) => {
  if (!userIds || userIds.length === 0) return [];
  const placeholders = userIds.map((_, i) => `$${i + 1}`).join(',');
  const r = await exec.query(
    `SELECT id FROM utilisateurs
     WHERE id IN (${placeholders}) AND statut = 'ACTIF' AND role = 'ETUDIANT'`,
    userIds
  );
  return r.rows.map((row) => row.id);
};

const idsGestionnaires = async (exec = db) => {
  const r = await exec.query(
    `SELECT id FROM utilisateurs WHERE statut = 'ACTIF' AND role IN ('ADMIN', 'GESTIONNAIRE')`
  );
  return r.rows.map((row) => row.id);
};

// Gestionnaires rattachés à un centre donné (messagerie interne par centre).
const idsGestionnairesDuCentre = async (centreId, exec = db) => {
  const r = await exec.query(
    `SELECT id FROM utilisateurs
     WHERE statut = 'ACTIF' AND role = 'GESTIONNAIRE' AND centre_id = $1`,
    [centreId]
  );
  return r.rows.map((row) => row.id);
};

// Sous-ensemble du staff (admin/gestionnaire) parmi une liste d'ids — message direct.
const idsStaffParmi = async (userIds, exec = db) => {
  if (!userIds || userIds.length === 0) return [];
  const placeholders = userIds.map((_, i) => `$${i + 1}`).join(',');
  const r = await exec.query(
    `SELECT id FROM utilisateurs
     WHERE id IN (${placeholders}) AND statut = 'ACTIF' AND role IN ('ADMIN', 'GESTIONNAIRE')`,
    userIds
  );
  return r.rows.map((row) => row.id);
};

const nomCentre = async (centreId, exec = db) => {
  const r = await exec.query('SELECT nom FROM centres WHERE id = $1', [centreId]);
  return r.rows[0]?.nom || null;
};

// ── Destinataires ────────────────────────────────────────────────────────

const assurerTableDestinataires = async (exec = db) => {
  await exec.query(`
    CREATE TABLE IF NOT EXISTS annonce_destinataires (
      id SERIAL PRIMARY KEY,
      annonce_id INTEGER NOT NULL REFERENCES annonces(id) ON DELETE CASCADE,
      utilisateur_id INTEGER NOT NULL REFERENCES utilisateurs(id),
      date_envoi TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      lu BOOLEAN DEFAULT FALSE,
      date_lecture TIMESTAMP,
      UNIQUE(annonce_id, utilisateur_id)
    )
  `);
};

const enregistrerDestinataires = async (annonceId, userIds, exec = db) => {
  if (userIds.length === 0) return;
  const values = [];
  const params = [];
  let i = 1;
  for (const userId of userIds) {
    values.push(`($${i}, $${i + 1})`);
    params.push(annonceId, userId);
    i += 2;
  }
  await exec.query(
    `INSERT INTO annonce_destinataires (annonce_id, utilisateur_id)
     VALUES ${values.join(', ')}
     ON CONFLICT (annonce_id, utilisateur_id) DO NOTHING`,
    params
  );
};

const idsDestinataires = async (annonceId, exec = db) => {
  const r = await exec.query(
    'SELECT utilisateur_id FROM annonce_destinataires WHERE annonce_id = $1',
    [annonceId]
  );
  return r.rows.map((row) => row.utilisateur_id);
};

// ── Journalisation d'activité ────────────────────────────────────────────

const journaliserActivite = async ({ utilisateurId, titre, description, metadata }, exec = db) => {
  await exec.query(
    `INSERT INTO activites (utilisateur_id, activity_type, title, description, metadata)
     VALUES ($1, 'ANNONCE_ENVOYEE', $2, $3, $4)`,
    [utilisateurId, titre, description, JSON.stringify(metadata)]
  );
};

// ── Lecture ──────────────────────────────────────────────────────────────

const detailComplet = async (annonceId, exec = db) => {
  const r = await exec.query(
    `SELECT a.*, c.nom as centre_nom,
            u.nom as created_by_nom, u.prenom as created_by_prenom,
            COUNT(ad.id) as total_destinataires
     FROM annonces a
     LEFT JOIN centres c ON a.centre_id = c.id
     LEFT JOIN utilisateurs u ON a.created_by = u.id
     LEFT JOIN annonce_destinataires ad ON a.id = ad.annonce_id
     WHERE a.id = $1
     GROUP BY a.id, c.nom, u.nom, u.prenom`,
    [annonceId]
  );
  return r.rows[0] || null;
};

const listeAdmin = async ({ statut, cible }, exec = db) => {
  let query = `
    SELECT a.*, c.nom as centre_nom,
           u.nom as created_by_nom, u.prenom as created_by_prenom,
           COUNT(ad.id) as total_destinataires
    FROM annonces a
    LEFT JOIN centres c ON a.centre_id = c.id
    LEFT JOIN utilisateurs u ON a.created_by = u.id
    LEFT JOIN annonce_destinataires ad ON a.id = ad.annonce_id
  `;
  const params = [];
  const conditions = [];
  if (statut) { params.push(statut); conditions.push(`a.statut = $${params.length}`); }
  if (cible) { params.push(cible); conditions.push(`a.cible = $${params.length}`); }
  if (conditions.length) query += ` WHERE ${conditions.join(' AND ')}`;
  query += ` GROUP BY a.id, c.nom, u.nom, u.prenom ORDER BY a.created_at DESC`;
  const r = await exec.query(query, params);
  return r.rows;
};

const listePourEtudiant = async (userId, limit, offset, exec = db) => {
  const r = await exec.query(
    `SELECT a.*, c.nom as centre_nom,
            u.nom as created_by_nom, u.prenom as created_by_prenom,
            ad.lu, ad.date_lecture
     FROM annonces a
     LEFT JOIN centres c ON a.centre_id = c.id
     LEFT JOIN utilisateurs u ON a.created_by = u.id
     LEFT JOIN annonce_destinataires ad ON a.id = ad.annonce_id AND ad.utilisateur_id = $1
     WHERE a.statut = 'PUBLIE'
       AND (
         a.cible = 'TOUS'
         OR (a.cible = 'CENTRE_SPECIFIQUE' AND EXISTS (
           SELECT 1 FROM attributions att
           JOIN logements l ON att.logement_id = l.id
           WHERE att.utilisateur_id = $1 AND l.centre_id = a.centre_id AND att.statut = 'ACTIVE'
         ))
         OR (a.cible = 'ETUDIANTS' AND ad.utilisateur_id = $1)
       )
       AND (a.date_expiration IS NULL OR a.date_expiration > CURRENT_TIMESTAMP)
       AND (a.date_publication IS NULL OR a.date_publication <= CURRENT_TIMESTAMP)
     ORDER BY a.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return r.rows;
};

const compteNonLues = async (userId, exec = db) => {
  const r = await exec.query(
    `SELECT COUNT(*)
     FROM annonce_destinataires ad
     JOIN annonces a ON ad.annonce_id = a.id
     WHERE ad.utilisateur_id = $1 AND ad.lu = FALSE AND a.statut = 'PUBLIE'
       AND (a.date_expiration IS NULL OR a.date_expiration > CURRENT_TIMESTAMP)`,
    [userId]
  );
  return parseInt(r.rows[0].count);
};

const detailPourUtilisateur = async (annonceId, userId, exec = db) => {
  const r = await exec.query(
    `SELECT a.*, c.nom as centre_nom,
            u.nom as created_by_nom, u.prenom as created_by_prenom,
            ad.lu, ad.date_lecture,
            COUNT(DISTINCT ad2.utilisateur_id) as total_destinataires
     FROM annonces a
     LEFT JOIN centres c ON a.centre_id = c.id
     LEFT JOIN utilisateurs u ON a.created_by = u.id
     LEFT JOIN annonce_destinataires ad ON a.id = ad.annonce_id AND ad.utilisateur_id = $1
     LEFT JOIN annonce_destinataires ad2 ON a.id = ad2.annonce_id
     WHERE a.id = $2
     GROUP BY a.id, c.nom, u.nom, u.prenom, ad.lu, ad.date_lecture`,
    [userId, annonceId]
  );
  return r.rows[0] || null;
};

const etudiantAAcces = async (annonceId, userId, exec = db) => {
  const r = await exec.query(
    `SELECT 1
     FROM annonces a
     LEFT JOIN annonce_destinataires ad ON a.id = ad.annonce_id
     WHERE a.id = $1 AND a.statut = 'PUBLIE'
       AND (
         a.cible = 'TOUS'
         OR (a.cible = 'CENTRE_SPECIFIQUE' AND EXISTS (
           SELECT 1 FROM attributions att
           JOIN logements l ON att.logement_id = l.id
           WHERE att.utilisateur_id = $2 AND l.centre_id = a.centre_id AND att.statut = 'ACTIVE'
         ))
         OR (a.cible = 'ETUDIANTS' AND ad.utilisateur_id = $2)
       )
       AND (a.date_expiration IS NULL OR a.date_expiration > CURRENT_TIMESTAMP)
     LIMIT 1`,
    [annonceId, userId]
  );
  return r.rows.length > 0;
};

// ── Messagerie interne (staff : admin / gestionnaire) ──────────────────────
// La boîte de réception s'appuie sur annonce_destinataires (destinataires déjà
// résolus à l'envoi), donc indépendante de Firebase.

const listePourStaff = async (userId, limit, offset, exec = db) => {
  const r = await exec.query(
    `SELECT a.*, c.nom as centre_nom,
            u.nom as created_by_nom, u.prenom as created_by_prenom,
            ad.lu, ad.date_lecture, ad.date_envoi
     FROM annonce_destinataires ad
     JOIN annonces a ON ad.annonce_id = a.id
     LEFT JOIN centres c ON a.centre_id = c.id
     LEFT JOIN utilisateurs u ON a.created_by = u.id
     WHERE ad.utilisateur_id = $1 AND a.statut = 'PUBLIE'
       AND (a.date_expiration IS NULL OR a.date_expiration > CURRENT_TIMESTAMP)
     ORDER BY a.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return r.rows;
};

// Marque une annonce comme lue pour l'utilisateur courant (idempotent).
const marquerLue = async (annonceId, userId, exec = db) => {
  const r = await exec.query(
    `UPDATE annonce_destinataires
       SET lu = TRUE, date_lecture = CURRENT_TIMESTAMP
     WHERE annonce_id = $1 AND utilisateur_id = $2 AND lu = FALSE
     RETURNING id`,
    [annonceId, userId]
  );
  return r.rows.length > 0;
};

// ── Modification ─────────────────────────────────────────────────────────

const changerStatut = async (annonceId, statut, exec = db) => {
  const r = await exec.query(
    `UPDATE annonces SET statut = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2 RETURNING *`,
    [statut, annonceId]
  );
  return r.rows[0] || null;
};

const supprimer = async (annonceId, exec = db) => {
  const r = await exec.query('DELETE FROM annonces WHERE id = $1 RETURNING id', [annonceId]);
  return r.rows.length > 0;
};

module.exports = {
  creer,
  idsTousEtudiants,
  idsEtudiantsDuCentre,
  idsEtudiantsParmi,
  idsGestionnaires,
  idsGestionnairesDuCentre,
  idsStaffParmi,
  nomCentre,
  assurerTableDestinataires,
  enregistrerDestinataires,
  idsDestinataires,
  journaliserActivite,
  detailComplet,
  listeAdmin,
  listePourEtudiant,
  listePourStaff,
  marquerLue,
  compteNonLues,
  detailPourUtilisateur,
  etudiantAAcces,
  changerStatut,
  supprimer,
};
