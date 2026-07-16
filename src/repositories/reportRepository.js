/**
 * Accès aux données : rapports admin (financier, utilisateurs).
 * ⚠️ Toutes les valeurs sont paramétrées ($n). L'ancienne version
 * interpolait date_from/date_to/centre_id directement dans le SQL
 * (injection SQL) — corrigé ici.
 */
const db = require('../config/database');

/** Construit la clause de filtre paramétrée du rapport financier */
const _filtresFinancier = ({ statut, date_from, date_to, centre_id }, alias = true) => {
  const p = alias ? 'p.' : '';
  const c = 'c.';
  let clause = `WHERE ${p}statut = $1`;
  const params = [statut];
  let i = 2;
  if (date_from) { clause += ` AND ${p}date_paiement >= $${i}`; params.push(date_from); i++; }
  if (date_to) { clause += ` AND ${p}date_paiement <= $${i}`; params.push(date_to); i++; }
  if (centre_id) { clause += ` AND ${c}id = $${i}`; params.push(centre_id); i++; }
  return { clause, params };
};

const rapportFinancier = async (filtres, exec = db) => {
  const { clause, params } = _filtresFinancier(filtres);

  const paiements = await exec.query(`
    SELECT p.id, p.montant, p.date_paiement, p.date_echeance, p.mode_paiement,
           p.statut, p.reference_transaction, p.created_at,
           u.id as user_id, u.matricule, u.nom, u.prenom, u.email, u.telephone,
           l.numero_chambre, l.type_chambre, l.prix_mensuel,
           c.id as centre_id, c.nom as centre_nom, c.ville as centre_ville
    FROM paiements p
    JOIN attributions a ON p.attribution_id = a.id
    JOIN utilisateurs u ON a.utilisateur_id = u.id
    JOIN logements l ON a.logement_id = l.id
    JOIN centres c ON l.centre_id = c.id
    ${clause}
    ORDER BY p.date_paiement DESC
  `, params);

  const totals = await exec.query(`
    SELECT COUNT(*) as count_paiements,
      COALESCE(SUM(p.montant), 0) as montant_total,
      COUNT(DISTINCT a.utilisateur_id) as count_etudiants,
      COUNT(DISTINCT c.id) as count_centres,
      AVG(p.montant) as montant_moyen,
      MIN(p.date_paiement) as date_premier, MAX(p.date_paiement) as date_dernier
    FROM paiements p
    JOIN attributions a ON p.attribution_id = a.id
    JOIN logements l ON a.logement_id = l.id
    JOIN centres c ON l.centre_id = c.id
    ${clause}
  `, params);

  // Par mode : mêmes filtres date, sans jointure centre → recalcul sans centre_id
  const modeFilters = _filtresFinancier({ ...filtres, centre_id: null }, false);
  const byMode = await exec.query(`
    SELECT mode_paiement, COUNT(*) as count, COALESCE(SUM(montant), 0) as total
    FROM paiements
    ${modeFilters.clause}
    GROUP BY mode_paiement
    ORDER BY total DESC
  `, modeFilters.params);

  const byCentre = await exec.query(`
    SELECT c.nom as centre, c.ville,
      COUNT(p.id) as count_paiements, COALESCE(SUM(p.montant), 0) as total
    FROM paiements p
    JOIN attributions a ON p.attribution_id = a.id
    JOIN logements l ON a.logement_id = l.id
    JOIN centres c ON l.centre_id = c.id
    ${clause}
    GROUP BY c.id, c.nom, c.ville
    ORDER BY total DESC
  `, params);

  return {
    paiements: paiements.rows,
    summary: { ...totals.rows[0], by_mode: byMode.rows, by_centre: byCentre.rows },
  };
};

const rapportUtilisateurs = async ({ role, statut, centre_id }, exec = db) => {
  let where = 'WHERE 1=1';
  const params = [];
  let i = 1;
  if (role) { where += ` AND u.role = $${i}`; params.push(role); i++; }
  if (statut) { where += ` AND u.statut = $${i}`; params.push(statut); i++; }
  if (centre_id) { where += ` AND c.id = $${i}`; params.push(centre_id); i++; }

  const users = await exec.query(`
    SELECT u.id, u.matricule, u.nom, u.prenom, u.email, u.telephone,
      u.role, u.statut, u.created_at, u.updated_at,
      c.id as centre_id, c.nom as centre_nom,
      l.id as logement_id, l.numero_chambre, l.type_chambre, l.prix_mensuel,
      a.date_debut, a.date_fin, a.statut as attribution_statut,
      (SELECT COUNT(*) FROM paiements p JOIN attributions a2 ON p.attribution_id = a2.id
       WHERE a2.utilisateur_id = u.id AND p.statut = 'CONFIRME') as paiements_count,
      (SELECT COALESCE(SUM(montant), 0) FROM paiements p JOIN attributions a2 ON p.attribution_id = a2.id
       WHERE a2.utilisateur_id = u.id AND p.statut = 'CONFIRME') as paiements_total,
      (SELECT COUNT(*) FROM signalements s JOIN attributions a3 ON s.attribution_id = a3.id
       WHERE a3.utilisateur_id = u.id) as signalements_count,
      (SELECT COUNT(*) FROM signalements s JOIN attributions a3 ON s.attribution_id = a3.id
       WHERE a3.utilisateur_id = u.id AND s.statut = 'RESOLU') as signalements_resolus
    FROM utilisateurs u
    LEFT JOIN attributions a ON u.id = a.utilisateur_id AND a.statut = 'ACTIVE'
    LEFT JOIN logements l ON a.logement_id = l.id
    LEFT JOIN centres c ON l.centre_id = c.id
    ${where}
    ORDER BY u.created_at DESC
  `, params);

  // Statistiques : mêmes filtres, sur la table utilisateurs seule
  let statsWhere = 'WHERE 1=1';
  const statsParams = [];
  let j = 1;
  if (role) { statsWhere += ` AND role = $${j}`; statsParams.push(role); j++; }
  if (statut) { statsWhere += ` AND statut = $${j}`; statsParams.push(statut); j++; }
  // centre_id ne s'applique pas à la table utilisateurs seule (pas de colonne fiable) :
  // on garde la stat globale filtrée par role/statut, cohérente avec l'ancienne intention.

  const stats = await exec.query(`
    SELECT COUNT(*) as total_users,
      COUNT(CASE WHEN role = 'ETUDIANT' THEN 1 END) as etudiants,
      COUNT(CASE WHEN role = 'GESTIONNAIRE' THEN 1 END) as gestionnaires,
      COUNT(CASE WHEN role = 'ADMIN' THEN 1 END) as admins,
      COUNT(CASE WHEN statut = 'ACTIF' THEN 1 END) as actifs,
      COUNT(CASE WHEN statut = 'INACTIF' THEN 1 END) as inactifs,
      COUNT(CASE WHEN statut = 'SUSPENDU' THEN 1 END) as suspendus,
      MIN(created_at) as date_premiere_inscription,
      MAX(created_at) as date_derniere_inscription
    FROM utilisateurs
    ${statsWhere}
  `, statsParams);

  return { users: users.rows, statistics: stats.rows[0] };
};

module.exports = { rapportFinancier, rapportUtilisateurs };
