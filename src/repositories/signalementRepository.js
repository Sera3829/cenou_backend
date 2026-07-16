/**
 * Accès aux données : signalements, équipes techniques, historique.
 */
const db = require('../config/database');

// ── Côté étudiant ────────────────────────────────────────────────────────

const inserer = async ({ attributionId, typeProbleme, description, photos, numeroSuivi }, exec = db) => {
  const r = await exec.query(
    `INSERT INTO signalements
      (attribution_id, type_probleme, description, photos, numero_suivi, statut)
     VALUES ($1, $2, $3, $4, $5, 'EN_ATTENTE')
     RETURNING id, numero_suivi, type_probleme, description, statut, created_at`,
    [attributionId, typeProbleme, description, photos, numeroSuivi]
  );
  return r.rows[0];
};

const listeParUtilisateur = async (utilisateurId, exec = db) => {
  const r = await exec.query(
    `SELECT s.id, s.numero_suivi, s.type_probleme, s.description,
            s.photos, s.statut, s.date_resolution, s.commentaire_resolution,
            s.created_at, s.updated_at,
            l.numero_chambre, c.nom as nom_centre
     FROM signalements s
     JOIN attributions a ON s.attribution_id = a.id
     JOIN logements l ON a.logement_id = l.id
     JOIN centres c ON l.centre_id = c.id
     WHERE a.utilisateur_id = $1
     ORDER BY s.created_at DESC`,
    [utilisateurId]
  );
  return r.rows;
};

const detailPourUtilisateur = async (signalementId, utilisateurId, exec = db) => {
  const r = await exec.query(
    `SELECT s.id, s.numero_suivi, s.type_probleme, s.description,
            s.photos, s.statut, s.date_resolution, s.commentaire_resolution,
            s.created_at, s.updated_at,
            l.numero_chambre, l.type_chambre,
            c.nom as nom_centre, c.ville,
            u.nom, u.prenom, u.matricule
     FROM signalements s
     JOIN attributions a ON s.attribution_id = a.id
     JOIN logements l ON a.logement_id = l.id
     JOIN centres c ON l.centre_id = c.id
     JOIN utilisateurs u ON a.utilisateur_id = u.id
     WHERE s.id = $1 AND a.utilisateur_id = $2`,
    [signalementId, utilisateurId]
  );
  return r.rows[0] || null;
};

const photosPourUtilisateur = async (signalementId, utilisateurId, exec = db) => {
  const r = await exec.query(
    `SELECT s.photos
     FROM signalements s
     JOIN attributions a ON s.attribution_id = a.id
     WHERE s.id = $1 AND a.utilisateur_id = $2`,
    [signalementId, utilisateurId]
  );
  return r.rows.length > 0 ? (r.rows[0].photos || []) : null;
};

// ── Côté admin ───────────────────────────────────────────────────────────

/** Clause WHERE paramétrée des filtres admin (aliases s/u/l/c) */
const construireFiltresAdmin = ({ type, statut, centre_id, date_from, date_to, search }) => {
  let whereClause = 'WHERE 1=1';
  const params = [];
  let paramIndex = 1;

  if (type && type !== 'TOUS') {
    whereClause += ` AND s.type_probleme = $${paramIndex}`;
    params.push(type);
    paramIndex++;
  }
  if (statut && statut !== 'TOUS') {
    whereClause += ` AND s.statut = $${paramIndex}`;
    params.push(statut);
    paramIndex++;
  }
  if (centre_id) {
    whereClause += ` AND c.id = $${paramIndex}`;
    params.push(centre_id);
    paramIndex++;
  }
  if (date_from) {
    whereClause += ` AND DATE(s.created_at) >= $${paramIndex}`;
    params.push(date_from);
    paramIndex++;
  }
  if (date_to) {
    whereClause += ` AND DATE(s.created_at) <= $${paramIndex}`;
    params.push(date_to);
    paramIndex++;
  }
  if (search && String(search).trim() !== '') {
    whereClause += ` AND (
      s.description ILIKE $${paramIndex} OR
      s.numero_suivi ILIKE $${paramIndex} OR
      u.nom ILIKE $${paramIndex} OR
      u.prenom ILIKE $${paramIndex} OR
      u.matricule ILIKE $${paramIndex} OR
      u.telephone ILIKE $${paramIndex} OR
      u.email ILIKE $${paramIndex} OR
      c.nom ILIKE $${paramIndex}
    )`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  return { whereClause, params, paramIndex };
};

/** Liste paginée admin — retourne { signalements, total } */
const listeAdmin = async (filtres, { page, limit }, exec = db) => {
  const { whereClause, params, paramIndex } = construireFiltresAdmin(filtres);
  const offset = (page - 1) * limit;

  const baseQuery = `
    SELECT
      s.id, s.numero_suivi, s.type_probleme, s.description, s.photos,
      s.statut, s.date_resolution, s.commentaire_resolution,
      s.created_at, s.updated_at, s.attribution_id,
      l.numero_chambre, l.type_chambre,
      c.nom as nom_centre, c.ville, c.id as centre_id,
      u.nom, u.prenom, u.matricule, u.telephone, u.email
    FROM signalements s
    LEFT JOIN attributions a ON s.attribution_id = a.id
    LEFT JOIN utilisateurs u ON a.utilisateur_id = u.id
    LEFT JOIN logements l ON a.logement_id = l.id
    LEFT JOIN centres c ON l.centre_id = c.id
    ${whereClause}
  `;

  const countResult = await exec.query(
    `SELECT COUNT(*) as total FROM (${baseQuery}) as sous_requete`,
    params
  );
  const total = parseInt(countResult.rows[0].total);

  const result = await exec.query(
    `${baseQuery} ORDER BY s.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, limit, offset]
  );

  return { signalements: result.rows, total };
};

/** Statistiques agrégées (le filtre centre passe par EXISTS sur l'attribution) */
const statistiquesAdmin = async (filtres, exec = db) => {
  let whereClause = 'WHERE 1=1';
  const params = [];
  let paramIndex = 1;

  if (filtres.type && filtres.type !== 'TOUS') {
    whereClause += ` AND s.type_probleme = $${paramIndex}`;
    params.push(filtres.type);
    paramIndex++;
  }
  if (filtres.statut && filtres.statut !== 'TOUS') {
    whereClause += ` AND s.statut = $${paramIndex}`;
    params.push(filtres.statut);
    paramIndex++;
  }
  if (filtres.centre_id) {
    whereClause += ` AND EXISTS (
      SELECT 1 FROM attributions a
      JOIN logements l ON a.logement_id = l.id
      WHERE a.id = s.attribution_id AND l.centre_id = $${paramIndex}
    )`;
    params.push(filtres.centre_id);
    paramIndex++;
  }
  if (filtres.date_from) {
    whereClause += ` AND DATE(s.created_at) >= $${paramIndex}`;
    params.push(filtres.date_from);
    paramIndex++;
  }
  if (filtres.date_to) {
    whereClause += ` AND DATE(s.created_at) <= $${paramIndex}`;
    params.push(filtres.date_to);
    paramIndex++;
  }
  if (filtres.search && String(filtres.search).trim() !== '') {
    whereClause += ` AND (
      s.description ILIKE $${paramIndex} OR
      s.numero_suivi ILIKE $${paramIndex}
    )`;
    params.push(`%${filtres.search}%`);
    paramIndex++;
  }

  const r = await exec.query(
    `SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE s.statut = 'EN_ATTENTE') as en_attente,
      COUNT(*) FILTER (WHERE s.statut = 'EN_COURS') as en_cours,
      COUNT(*) FILTER (WHERE s.statut = 'RESOLU') as resolus,
      COUNT(*) FILTER (WHERE s.statut = 'ANNULE') as annules,
      COUNT(*) FILTER (WHERE s.type_probleme = 'PLOMBERIE') as plomberie,
      COUNT(*) FILTER (WHERE s.type_probleme = 'ELECTRICITE') as electricite,
      COUNT(*) FILTER (WHERE s.type_probleme = 'MOBILIER') as mobilier,
      COUNT(*) FILTER (WHERE s.type_probleme = 'TOITURE') as toiture,
      COUNT(*) FILTER (WHERE s.type_probleme = 'SERRURE') as serrure,
      COUNT(*) FILTER (WHERE s.type_probleme = 'AUTRE') as autre,
      CASE
        WHEN COUNT(*) - COUNT(*) FILTER (WHERE s.statut = 'ANNULE') > 0
        THEN ROUND(
          (COUNT(*) FILTER (WHERE s.statut = 'RESOLU') * 100.0) /
          (COUNT(*) - COUNT(*) FILTER (WHERE s.statut = 'ANNULE')),
          1
        )
        ELSE 0
      END as taux_resolution
    FROM signalements s
    ${whereClause}`,
    params
  );
  return r.rows[0];
};

/** Détail admin avec infos étudiant/logement/centre (centreId = restriction) */
const detailAdmin = async (signalementId, centreId = null, exec = db) => {
  const params = [signalementId];
  let centreClause = '';
  if (centreId !== null) {
    centreClause = 'AND l.centre_id = $2';
    params.push(centreId);
  }
  const r = await exec.query(
    `SELECT
       s.id, s.numero_suivi, s.type_probleme, s.description,
       s.photos, s.statut, s.date_resolution, s.commentaire_resolution,
       s.created_at, s.updated_at,
       a.utilisateur_id AS user_id,
       u.nom, u.prenom, u.matricule, u.telephone, u.email,
       l.numero_chambre,
       c.nom AS nom_centre,
       c.ville
     FROM signalements s
     LEFT JOIN attributions a ON s.attribution_id = a.id
     LEFT JOIN utilisateurs u ON a.utilisateur_id = u.id
     LEFT JOIN logements l ON a.logement_id = l.id
     LEFT JOIN centres c ON l.centre_id = c.id
     WHERE s.id = $1 ${centreClause}`,
    params
  );
  return r.rows[0] || null;
};

const mettreAJourStatut = async (signalementId, { statut, commentaireResolution }, exec = db) => {
  const updateFields = ['statut = $1', 'updated_at = CURRENT_TIMESTAMP'];
  const params = [statut];
  let paramIndex = 2;

  if ((statut === 'RESOLU' || statut === 'ANNULE') && commentaireResolution) {
    updateFields.push(`commentaire_resolution = $${paramIndex}`);
    params.push(commentaireResolution);
    paramIndex++;
  }
  if (statut === 'RESOLU') {
    updateFields.push('date_resolution = CURRENT_TIMESTAMP');
  }
  params.push(signalementId);

  const r = await exec.query(
    `UPDATE signalements
     SET ${updateFields.join(', ')}
     WHERE id = $${paramIndex}
     RETURNING
       id, numero_suivi, type_probleme, description, photos, statut,
       date_resolution, commentaire_resolution, created_at, updated_at`,
    params
  );
  return r.rows[0];
};

// ── Équipes techniques ───────────────────────────────────────────────────

const equipesActives = async (exec = db) => {
  const r = await exec.query(
    `SELECT
       et.id, et.nom, et.description, et.specialite, et.chef_equipe,
       et.telephone, et.email, et.statut, et.created_at,
       COUNT(s.id) as signalements_en_cours
     FROM equipes_techniques et
     LEFT JOIN signalements s ON et.id = s.equipe_id AND s.statut = 'EN_COURS'
     WHERE et.statut = 'ACTIVE'
     GROUP BY et.id
     ORDER BY et.nom`
  );
  return r.rows;
};

const equipeActiveParId = async (equipeId, exec = db) => {
  const r = await exec.query(
    `SELECT id, nom FROM equipes_techniques WHERE id = $1 AND statut = 'ACTIVE'`,
    [equipeId]
  );
  return r.rows[0] || null;
};

/** Signalement EN_ATTENTE (restreint au centre si fourni) — pour affectation */
const trouverEnAttente = async (signalementId, centreId = null, exec = db) => {
  const params = [signalementId];
  let centreClause = '';
  if (centreId !== null) {
    centreClause = `AND EXISTS (
      SELECT 1 FROM attributions a
      JOIN logements l ON a.logement_id = l.id
      WHERE a.id = signalements.attribution_id AND l.centre_id = $2
    )`;
    params.push(centreId);
  }
  const r = await exec.query(
    `SELECT id, statut, attribution_id
     FROM signalements
     WHERE id = $1 AND statut = 'EN_ATTENTE' ${centreClause}`,
    params
  );
  return r.rows[0] || null;
};

const affecterEquipe = async (signalementId, equipeId, exec = db) => {
  const r = await exec.query(
    `UPDATE signalements
     SET statut = 'EN_COURS', equipe_id = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2
     RETURNING id, statut, numero_suivi`,
    [equipeId, signalementId]
  );
  return r.rows[0];
};

const insererHistorique = async ({ signalementId, action, details, effectuePar }, exec = db) => {
  await exec.query(
    `INSERT INTO signalement_historique (signalement_id, action, details, effectue_par)
     VALUES ($1, $2, $3, $4)`,
    [signalementId, action, JSON.stringify(details), effectuePar]
  );
};

const utilisateurDuSignalement = async (signalementId, exec = db) => {
  const r = await exec.query(
    `SELECT u.id, u.nom, u.prenom
     FROM signalements s
     JOIN attributions a ON s.attribution_id = a.id
     JOIN utilisateurs u ON a.utilisateur_id = u.id
     WHERE s.id = $1`,
    [signalementId]
  );
  return r.rows[0] || null;
};

module.exports = {
  inserer,
  listeParUtilisateur,
  detailPourUtilisateur,
  photosPourUtilisateur,
  listeAdmin,
  statistiquesAdmin,
  detailAdmin,
  mettreAJourStatut,
  equipesActives,
  equipeActiveParId,
  trouverEnAttente,
  affecterEquipe,
  insererHistorique,
  utilisateurDuSignalement,
};
