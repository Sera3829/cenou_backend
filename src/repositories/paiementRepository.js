/**
 * Accès aux données : paiements et transactions.
 */
const db = require('../config/database');

// ── Côté étudiant ────────────────────────────────────────────────────────

const listeParUtilisateur = async (utilisateurId, exec = db) => {
  const r = await exec.query(
    `SELECT p.id, p.montant, p.date_paiement, p.date_echeance,
            p.mode_paiement, p.reference_transaction, p.statut,
            l.numero_chambre, l.type_chambre,
            c.nom as nom_centre
     FROM paiements p
     JOIN attributions a ON p.attribution_id = a.id
     JOIN logements l ON a.logement_id = l.id
     JOIN centres c ON l.centre_id = c.id
     WHERE a.utilisateur_id = $1
     ORDER BY p.date_paiement DESC`,
    [utilisateurId]
  );
  return r.rows;
};

const detailPourUtilisateur = async (paiementId, utilisateurId, exec = db) => {
  const r = await exec.query(
    `SELECT p.id, p.montant, p.date_paiement, p.date_echeance,
            p.mode_paiement, p.reference_transaction, p.statut, p.created_at,
            l.numero_chambre, l.type_chambre, l.prix_mensuel,
            c.nom as nom_centre, c.ville,
            u.nom, u.prenom, u.matricule, u.email
     FROM paiements p
     JOIN attributions a ON p.attribution_id = a.id
     JOIN logements l ON a.logement_id = l.id
     JOIN centres c ON l.centre_id = c.id
     JOIN utilisateurs u ON a.utilisateur_id = u.id
     WHERE p.id = $1 AND a.utilisateur_id = $2`,
    [paiementId, utilisateurId]
  );
  return r.rows[0] || null;
};

const enAttenteParUtilisateur = async (utilisateurId, exec = db) => {
  const r = await exec.query(
    `SELECT p.id, p.montant, p.date_echeance, p.statut,
            l.numero_chambre, l.prix_mensuel,
            c.nom as nom_centre,
            CASE
              WHEN p.date_echeance < CURRENT_DATE THEN true
              ELSE false
            END as en_retard
     FROM paiements p
     JOIN attributions a ON p.attribution_id = a.id
     JOIN logements l ON a.logement_id = l.id
     JOIN centres c ON l.centre_id = c.id
     WHERE a.utilisateur_id = $1
       AND p.statut IN ('EN_ATTENTE', 'ECHEC')
     ORDER BY p.date_echeance ASC`,
    [utilisateurId]
  );
  return r.rows;
};

const inserer = async (
  { attributionId, montant, dateEcheance, dateFin, nombreMois, modePaiement, reference },
  exec = db
) => {
  const r = await exec.query(
    `INSERT INTO paiements
       (attribution_id, montant, date_echeance, date_fin, nombre_mois, mode_paiement, reference_transaction, statut)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'EN_ATTENTE')
     RETURNING id, reference_transaction`,
    [attributionId, montant, dateEcheance, dateFin, nombreMois, modePaiement, reference]
  );
  return r.rows[0];
};

const insererTransaction = async ({ paiementId, montant, statut, details }, exec = db) => {
  await exec.query(
    `INSERT INTO transactions (paiement_id, montant, statut, details)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [paiementId, montant, statut, JSON.stringify(details)]
  );
};

const mettreAJourReference = async (paiementId, reference, exec = db) => {
  await exec.query('UPDATE paiements SET reference_transaction = $1 WHERE id = $2', [reference, paiementId]);
};

const marquerEchec = async (paiementId, exec = db) => {
  await exec.query(`UPDATE paiements SET statut = 'ECHEC' WHERE id = $1`, [paiementId]);
};

// ── Callback opérateur ───────────────────────────────────────────────────

/** La référence stockée est soit exacte, soit suffixée de l'ID opérateur */
const trouverParReference = async (reference, exec = db) => {
  const r = await exec.query(
    `SELECT p.id, p.attribution_id, p.montant, p.statut,
            a.utilisateur_id
     FROM paiements p
     JOIN attributions a ON p.attribution_id = a.id
     WHERE p.reference_transaction = $1
        OR p.reference_transaction LIKE $1 || '-%'`,
    [reference]
  );
  return r.rows[0] || null;
};

const changerStatutCallback = async (paiementId, nouveauStatut, exec = db) => {
  await exec.query(
    `UPDATE paiements
     SET statut = $1::varchar,
         date_paiement = CASE WHEN $1::varchar = 'CONFIRME' THEN CURRENT_TIMESTAMP ELSE date_paiement END
     WHERE id = $2`,
    [nouveauStatut, paiementId]
  );
};

// ── Simulation ───────────────────────────────────────────────────────────

const trouverPourProprietaire = async (paiementId, utilisateurId, exec = db) => {
  const r = await exec.query(
    `SELECT p.id, p.montant, p.statut, a.utilisateur_id
     FROM paiements p
     JOIN attributions a ON p.attribution_id = a.id
     WHERE p.id = $1 AND a.utilisateur_id = $2`,
    [paiementId, utilisateurId]
  );
  return r.rows[0] || null;
};

const confirmer = async (paiementId, exec = db) => {
  await exec.query(
    `UPDATE paiements
     SET statut = 'CONFIRME', date_paiement = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [paiementId]
  );
};

// ── Côté admin ───────────────────────────────────────────────────────────

/**
 * Construit la clause WHERE paramétrée des filtres admin.
 * Retourne { whereClause, params } — paramIndex démarre à 1.
 */
const construireFiltresAdmin = ({ statut, mode_paiement, date_from, date_to, centre_id, search }) => {
  let whereClause = 'WHERE 1=1';
  const params = [];
  let paramIndex = 1;

  if (statut && statut !== 'TOUS') {
    whereClause += ` AND p.statut = $${paramIndex}`;
    params.push(statut);
    paramIndex++;
  }
  if (mode_paiement && mode_paiement !== 'TOUS') {
    whereClause += ` AND p.mode_paiement = $${paramIndex}`;
    params.push(mode_paiement);
    paramIndex++;
  }
  if (date_from) {
    whereClause += ` AND DATE(p.date_paiement) >= $${paramIndex}`;
    params.push(date_from);
    paramIndex++;
  }
  if (date_to) {
    whereClause += ` AND DATE(p.date_paiement) <= $${paramIndex}`;
    params.push(date_to);
    paramIndex++;
  }
  if (centre_id) {
    whereClause += ` AND c.id = $${paramIndex}`;
    params.push(centre_id);
    paramIndex++;
  }
  if (search) {
    whereClause += ` AND (
      u.matricule ILIKE $${paramIndex} OR
      u.nom ILIKE $${paramIndex} OR
      u.prenom ILIKE $${paramIndex} OR
      u.email ILIKE $${paramIndex} OR
      l.numero_chambre ILIKE $${paramIndex} OR
      c.nom ILIKE $${paramIndex}
    )`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  return { whereClause, params, paramIndex };
};

/** Statistiques agrégées en une seule passe (FILTER) */
const statistiquesAdmin = async (filtres, exec = db) => {
  const { whereClause, params } = construireFiltresAdmin(filtres);
  const r = await exec.query(
    `SELECT
      COUNT(*) FILTER (WHERE p.statut = 'CONFIRME')      as confirmes,
      COUNT(*) FILTER (WHERE p.statut = 'EN_ATTENTE')    as en_attente,
      COUNT(*) FILTER (WHERE p.statut = 'ECHEC')         as echecs,
      COUNT(*) FILTER (WHERE p.mode_paiement = 'ORANGE_MONEY') as orange_money,
      COUNT(*) FILTER (WHERE p.mode_paiement = 'MOOV_MONEY')   as moov_money,
      COUNT(*) FILTER (WHERE p.mode_paiement = 'ESPECES')      as especes,
      COUNT(*) FILTER (WHERE p.mode_paiement = 'VIREMENT')     as virement,
      COALESCE(SUM(p.montant) FILTER (WHERE p.statut = 'CONFIRME'), 0)   as total_confirme,
      COALESCE(SUM(p.montant) FILTER (WHERE p.statut = 'EN_ATTENTE'), 0) as total_en_attente,
      COALESCE(SUM(p.montant) FILTER (WHERE p.statut = 'ECHEC'), 0)      as total_echec,
      COUNT(*) as total
    FROM paiements p
    JOIN attributions a ON p.attribution_id = a.id
    JOIN logements l ON a.logement_id = l.id
    JOIN centres c ON l.centre_id = c.id
    ${whereClause}`,
    params
  );
  return r.rows[0];
};

/** Liste paginée admin — retourne { paiements, total } */
const listeAdmin = async (filtres, { page, limit }, exec = db) => {
  const { whereClause, params, paramIndex } = construireFiltresAdmin(filtres);
  const offset = (page - 1) * limit;

  const baseQuery = `
    SELECT
      p.id, p.montant, p.date_paiement, p.date_echeance, p.mode_paiement,
      p.reference_transaction, p.statut, p.created_at, p.updated_at,
      u.id as user_id, u.matricule, u.nom, u.prenom, u.email, u.telephone,
      l.numero_chambre, l.type_chambre, l.prix_mensuel,
      c.id as centre_id, c.nom as centre_nom, c.ville as centre_ville
    FROM paiements p
    JOIN attributions a ON p.attribution_id = a.id
    JOIN utilisateurs u ON a.utilisateur_id = u.id
    JOIN logements l ON a.logement_id = l.id
    JOIN centres c ON l.centre_id = c.id
    ${whereClause}
  `;

  const countResult = await exec.query(`SELECT COUNT(*) FROM (${baseQuery}) as subquery`, params);
  const total = parseInt(countResult.rows[0].count);

  const result = await exec.query(
    `${baseQuery} ORDER BY p.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, limit, offset]
  );

  return { paiements: result.rows, total };
};

/** Détail admin — centreId non nul = restriction au centre */
const detailAdmin = async (paiementId, centreId = null, exec = db) => {
  const params = [paiementId];
  let centreClause = '';
  if (centreId !== null) {
    centreClause = 'AND c.id = $2';
    params.push(centreId);
  }
  const r = await exec.query(
    `SELECT
      p.id, p.montant, p.date_paiement, p.date_echeance, p.mode_paiement,
      p.reference_transaction, p.statut, p.created_at, p.updated_at,
      u.id as user_id, u.matricule, u.nom, u.prenom, u.email, u.telephone,
      u.role, u.statut as user_statut,
      l.id as logement_id, l.numero_chambre, l.type_chambre, l.prix_mensuel,
      l.statut as logement_statut,
      c.id as centre_id, c.nom as centre_nom, c.ville, c.adresse,
      a.id as attribution_id, a.date_debut, a.date_fin, a.statut as attribution_statut
    FROM paiements p
    JOIN attributions a ON p.attribution_id = a.id
    JOIN utilisateurs u ON a.utilisateur_id = u.id
    JOIN logements l ON a.logement_id = l.id
    JOIN centres c ON l.centre_id = c.id
    WHERE p.id = $1 ${centreClause}`,
    params
  );
  return r.rows[0] || null;
};

/** Vérifie l'existence d'un paiement (restreint au centre si fourni) */
const trouverPourMiseAJourAdmin = async (paiementId, centreId = null, exec = db) => {
  const params = [paiementId];
  let centreClause = '';
  if (centreId !== null) {
    centreClause = `AND EXISTS (
      SELECT 1 FROM attributions a
      JOIN logements l ON a.logement_id = l.id
      WHERE a.id = paiements.attribution_id AND l.centre_id = $2
    )`;
    params.push(centreId);
  }
  const r = await exec.query(
    `SELECT id, statut, attribution_id FROM paiements WHERE id = $1 ${centreClause}`,
    params
  );
  return r.rows[0] || null;
};

const changerStatutAdmin = async (paiementId, statut, exec = db) => {
  const r = await exec.query(
    `UPDATE paiements
     SET statut = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2
     RETURNING id, statut, date_paiement`,
    [statut, paiementId]
  );
  return r.rows[0];
};

const fixerDatePaiementSiAbsente = async (paiementId, exec = db) => {
  await exec.query(
    `UPDATE paiements
     SET date_paiement = COALESCE(date_paiement, CURRENT_TIMESTAMP)
     WHERE id = $1`,
    [paiementId]
  );
};

const insererHistorique = async ({ paiementId, ancienStatut, nouveauStatut, modifiePar, raison }, exec = db) => {
  await exec.query(
    `INSERT INTO paiement_historique (paiement_id, ancien_statut, nouveau_statut, modifie_par, raison)
     VALUES ($1, $2, $3, $4, $5)`,
    [paiementId, ancienStatut, nouveauStatut, modifiePar, raison || null]
  );
};

const utilisateurDeLAttribution = async (attributionId, exec = db) => {
  const r = await exec.query(
    `SELECT u.id, u.matricule, u.nom, u.prenom
     FROM attributions a
     JOIN utilisateurs u ON a.utilisateur_id = u.id
     WHERE a.id = $1`,
    [attributionId]
  );
  return r.rows[0] || null;
};

module.exports = {
  listeParUtilisateur,
  detailPourUtilisateur,
  enAttenteParUtilisateur,
  inserer,
  insererTransaction,
  mettreAJourReference,
  marquerEchec,
  trouverParReference,
  changerStatutCallback,
  trouverPourProprietaire,
  confirmer,
  statistiquesAdmin,
  listeAdmin,
  detailAdmin,
  trouverPourMiseAJourAdmin,
  changerStatutAdmin,
  fixerDatePaiementSiAbsente,
  insererHistorique,
  utilisateurDeLAttribution,
};
