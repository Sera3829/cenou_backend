/**
 * Accès aux données : dashboard admin (statistiques, graphiques, activité).
 * Le cloisonnement par centre est passé en paramètre (scope = null | id).
 */
const db = require('../config/database');

/** Statistiques générales + paiements + signalements + centres + activité */
const statistiques = async (scope, exec = db) => {
  const scoped = scope !== null;
  const p = scoped ? [scope] : [];

  const logementFilter = scoped ? 'WHERE l.centre_id = $1' : '';
  const paiementFilter = scoped
    ? `WHERE EXISTS (SELECT 1 FROM attributions a JOIN logements l ON a.logement_id = l.id
                     WHERE a.id = p.attribution_id AND l.centre_id = $1)`
    : '';
  const signalementFilter = scoped
    ? `WHERE EXISTS (SELECT 1 FROM attributions a JOIN logements l ON a.logement_id = l.id
                     WHERE a.id = s.attribution_id AND l.centre_id = $1)`
    : '';

  const general = await exec.query(`
    SELECT
      (SELECT COUNT(DISTINCT u.id) FROM utilisateurs u
       ${scoped
         ? `JOIN attributions a ON a.utilisateur_id = u.id AND a.statut = 'ACTIVE'
            JOIN logements l ON a.logement_id = l.id AND l.centre_id = $1`
         : ''}
       WHERE u.role = 'ETUDIANT' AND u.statut = 'ACTIF') as total_etudiants,
      (SELECT COUNT(*) FROM utilisateurs
       WHERE role = 'GESTIONNAIRE' AND statut = 'ACTIF' ${scoped ? 'AND centre_id = $1' : ''}) as total_gestionnaires,
      (SELECT COUNT(*) FROM utilisateurs WHERE role = 'ADMIN' AND statut = 'ACTIF') as total_admins,
      (SELECT COUNT(*) FROM centres ${scoped ? 'WHERE id = $1' : ''}) as total_centres,
      (SELECT COUNT(*) FROM logements l ${logementFilter}) as total_logements,
      (SELECT COUNT(*) FROM logements l ${logementFilter} ${scoped ? 'AND' : 'WHERE'} l.statut = 'OCCUPE') as logements_occupes,
      (SELECT COUNT(*) FROM logements l ${logementFilter} ${scoped ? 'AND' : 'WHERE'} l.statut = 'DISPONIBLE') as logements_disponibles
  `, p);

  const paiements = await exec.query(`
    SELECT
      COUNT(*) as total_paiements,
      COUNT(CASE WHEN p.statut = 'CONFIRME' THEN 1 END) as paiements_confirme,
      COUNT(CASE WHEN p.statut = 'EN_ATTENTE' THEN 1 END) as paiements_en_attente,
      COUNT(CASE WHEN p.statut = 'ECHEC' THEN 1 END) as paiements_echec,
      COALESCE(SUM(CASE WHEN p.statut = 'CONFIRME' THEN p.montant ELSE 0 END), 0) as montant_total,
      COALESCE(AVG(CASE WHEN p.statut = 'CONFIRME' THEN p.montant END), 0) as montant_moyen,
      COALESCE(SUM(CASE WHEN p.statut = 'CONFIRME' AND p.date_paiement >= CURRENT_DATE - INTERVAL '30 days' THEN p.montant ELSE 0 END), 0) as montant_30jours
    FROM paiements p
    ${paiementFilter}
  `, p);

  const signalements = await exec.query(`
    SELECT
      COUNT(*) as total_signalements,
      COUNT(CASE WHEN s.statut = 'EN_ATTENTE' THEN 1 END) as signalements_en_attente,
      COUNT(CASE WHEN s.statut = 'EN_COURS' THEN 1 END) as signalements_en_cours,
      COUNT(CASE WHEN s.statut = 'RESOLU' THEN 1 END) as signalements_resolus,
      COUNT(CASE WHEN s.statut = 'ANNULE' THEN 1 END) as signalements_annules,
      ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(s.date_resolution, CURRENT_TIMESTAMP) - s.created_at)) / 86400), 1) as duree_moyenne_jours,
      COUNT(DISTINCT s.type_probleme) as types_problemes_differents
    FROM signalements s
    ${signalementFilter}
  `, p);

  const centres = await exec.query(`
    SELECT c.id, c.nom, c.ville,
      COUNT(DISTINCT a.utilisateur_id) as etudiants_count,
      COUNT(DISTINCT l.id) as logements_count,
      COUNT(DISTINCT CASE WHEN a.statut = 'ACTIVE' THEN a.id END) as attributions_actives,
      COALESCE(SUM(CASE WHEN p.statut = 'CONFIRME' THEN p.montant ELSE 0 END), 0) as revenus_total
    FROM centres c
    LEFT JOIN logements l ON c.id = l.centre_id
    LEFT JOIN attributions a ON l.id = a.logement_id
    LEFT JOIN paiements p ON a.id = p.attribution_id
    ${scoped ? 'WHERE c.id = $1' : ''}
    GROUP BY c.id, c.nom, c.ville
    ORDER BY c.nom
  `, p);

  const recentActivity = await exec.query(`
    (SELECT 'PAIEMENT' as type, 'Paiement confirmé' as action,
       CONCAT(u.prenom, ' ', u.nom) as user, p.montant::TEXT as details,
       p.date_paiement as timestamp, p.id as reference_id
     FROM paiements p
     JOIN attributions a ON p.attribution_id = a.id
     JOIN utilisateurs u ON a.utilisateur_id = u.id
     JOIN logements l ON a.logement_id = l.id
     WHERE p.statut = 'CONFIRME' ${scoped ? 'AND l.centre_id = $1' : ''}
     ORDER BY p.date_paiement DESC LIMIT 5)
    UNION ALL
    (SELECT 'SIGNALEMENT' as type, CONCAT('Signalement ', s.type_probleme) as action,
       CONCAT(u.prenom, ' ', u.nom) as user, l.numero_chambre::TEXT as details,
       s.created_at as timestamp, s.id as reference_id
     FROM signalements s
     JOIN attributions a ON s.attribution_id = a.id
     JOIN utilisateurs u ON a.utilisateur_id = u.id
     JOIN logements l ON a.logement_id = l.id
     ${scoped ? 'WHERE l.centre_id = $1' : ''}
     ORDER BY s.created_at DESC LIMIT 5)
    UNION ALL
    (SELECT 'INSCRIPTION' as type, 'Nouvel étudiant' as action,
       CONCAT(u.prenom, ' ', u.nom) as user, u.matricule::TEXT as details,
       u.created_at as timestamp, u.id as reference_id
     FROM utilisateurs u
     WHERE u.role = 'ETUDIANT'
       ${scoped ? `AND EXISTS (
         SELECT 1 FROM attributions a JOIN logements l ON a.logement_id = l.id
         WHERE a.utilisateur_id = u.id AND a.statut = 'ACTIVE' AND l.centre_id = $1
       )` : ''}
     ORDER BY u.created_at DESC LIMIT 5)
    ORDER BY timestamp DESC LIMIT 15
  `, p);

  return {
    general: general.rows[0],
    paiements: paiements.rows[0],
    signalements: signalements.rows[0],
    centres: centres.rows,
    recent_activity: recentActivity.rows,
  };
};

/** Graphiques. period est déjà validé contre une liste blanche par le service. */
const graphiques = async (period, centreId, exec = db) => {
  const p = centreId ? [centreId] : [];
  const existsPaiement = centreId
    ? 'AND EXISTS (SELECT 1 FROM attributions a JOIN logements l ON a.logement_id = l.id WHERE a.id = paiements.attribution_id AND l.centre_id = $1)'
    : '';
  const existsSignalement = centreId
    ? 'AND EXISTS (SELECT 1 FROM attributions a JOIN logements l ON a.logement_id = l.id WHERE a.id = signalements.attribution_id AND l.centre_id = $1)'
    : '';

  const paiements = await exec.query(`
    SELECT DATE_TRUNC('${period}', date_paiement) as period,
           COUNT(*) as count, COALESCE(SUM(montant), 0) as total, mode_paiement
    FROM paiements
    WHERE statut = 'CONFIRME'
      AND date_paiement >= CURRENT_DATE - INTERVAL '6 ${period}s'
      ${existsPaiement}
    GROUP BY DATE_TRUNC('${period}', date_paiement), mode_paiement
    ORDER BY period, mode_paiement
  `, p);

  const signalements = await exec.query(`
    SELECT DATE_TRUNC('${period}', created_at) as period, statut, COUNT(*) as count
    FROM signalements
    WHERE created_at >= CURRENT_DATE - INTERVAL '6 ${period}s'
      ${existsSignalement}
    GROUP BY DATE_TRUNC('${period}', created_at), statut
    ORDER BY period, statut
  `, p);

  const signalementsTypes = await exec.query(`
    SELECT type_probleme, COUNT(*) as count,
      COUNT(CASE WHEN statut = 'RESOLU' THEN 1 END) as resolved,
      COUNT(CASE WHEN statut = 'EN_ATTENTE' THEN 1 END) as pending,
      COUNT(CASE WHEN statut = 'EN_COURS' THEN 1 END) as in_progress,
      ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(date_resolution, CURRENT_TIMESTAMP) - created_at)) / 86400), 1) as avg_duration_days
    FROM signalements
    ${centreId ? 'WHERE EXISTS (SELECT 1 FROM attributions a JOIN logements l ON a.logement_id = l.id WHERE a.id = signalements.attribution_id AND l.centre_id = $1)' : ''}
    GROUP BY type_probleme
    ORDER BY count DESC
  `, p);

  const occupation = await exec.query(`
    SELECT c.nom as centre,
      COUNT(l.id) as total_logements,
      COUNT(CASE WHEN l.statut = 'OCCUPE' THEN 1 END) as logements_occupes,
      COUNT(CASE WHEN l.statut = 'DISPONIBLE' THEN 1 END) as logements_disponibles,
      COUNT(CASE WHEN l.statut = 'MAINTENANCE' THEN 1 END) as logements_maintenance,
      ROUND(COUNT(CASE WHEN l.statut = 'OCCUPE' THEN 1 END) * 100.0 / NULLIF(COUNT(l.id), 0), 1) as taux_occupation
    FROM centres c
    LEFT JOIN logements l ON c.id = l.centre_id
    ${centreId ? 'WHERE c.id = $1' : ''}
    GROUP BY c.id, c.nom
    ORDER BY taux_occupation DESC
  `, p);

  return {
    paiements: paiements.rows,
    signalements: signalements.rows,
    signalements_types: signalementsTypes.rows,
    occupation: occupation.rows,
    period,
  };
};

/** Activité récente détaillée (union multi-sources) */
const activiteRecente = async (scope, { half, qrtr, total }, exec = db) => {
  const scoped = scope !== null;
  const params = scoped ? [half, qrtr, qrtr, total, scope] : [half, qrtr, qrtr, total];

  const r = await exec.query(`
    (SELECT 'PAIEMENT_CONFIRME' AS activity_type, 'Paiement confirmé' AS title,
      CONCAT('Paiement de ', p.montant, ' FCFA - Chambre ', l.numero_chambre) AS description,
      p.date_paiement AS timestamp,
      JSON_BUILD_OBJECT('paiement_id', p.id, 'user_id', u.id, 'montant', p.montant,
        'mode_paiement', p.mode_paiement, 'chambre', l.numero_chambre,
        'numero_chambre', l.numero_chambre, 'centre_nom', c.nom) AS metadata
     FROM paiements p
     JOIN attributions a ON p.attribution_id = a.id
     JOIN utilisateurs u ON a.utilisateur_id = u.id
     JOIN logements l ON a.logement_id = l.id
     JOIN centres c ON l.centre_id = c.id
     WHERE p.statut = 'CONFIRME' ${scoped ? 'AND l.centre_id = $5' : ''}
     ORDER BY p.date_paiement DESC LIMIT $1)
    UNION ALL
    (SELECT 'PAIEMENT_INITIE' AS activity_type, 'Paiement initié' AS title,
      CONCAT('Paiement de ', p.montant, ' FCFA - Chambre ', l.numero_chambre) AS description,
      p.created_at AS timestamp,
      JSON_BUILD_OBJECT('paiement_id', p.id, 'user_id', u.id, 'montant', p.montant,
        'mode_paiement', p.mode_paiement, 'chambre', l.numero_chambre,
        'numero_chambre', l.numero_chambre, 'centre_nom', c.nom) AS metadata
     FROM paiements p
     JOIN attributions a ON p.attribution_id = a.id
     JOIN utilisateurs u ON a.utilisateur_id = u.id
     JOIN logements l ON a.logement_id = l.id
     JOIN centres c ON l.centre_id = c.id
     WHERE p.statut = 'EN_ATTENTE' ${scoped ? 'AND l.centre_id = $5' : ''}
     ORDER BY p.created_at DESC LIMIT $1)
    UNION ALL
    (SELECT 'SIGNALEMENT_CREATE' AS activity_type, 'Nouveau signalement' AS title,
      CONCAT('Signalement ', s.type_probleme, ' - Chambre ', l.numero_chambre) AS description,
      s.created_at AS timestamp,
      JSON_BUILD_OBJECT('signalement_id', s.id, 'user_id', u.id, 'type_probleme', s.type_probleme,
        'statut', s.statut, 'chambre', l.numero_chambre,
        'numero_chambre', l.numero_chambre, 'centre_nom', c.nom) AS metadata
     FROM signalements s
     JOIN attributions a ON s.attribution_id = a.id
     JOIN utilisateurs u ON a.utilisateur_id = u.id
     JOIN logements l ON a.logement_id = l.id
     JOIN centres c ON l.centre_id = c.id
     ${scoped ? 'WHERE l.centre_id = $5' : ''}
     ORDER BY s.created_at DESC LIMIT $1)
    UNION ALL
    (SELECT 'SIGNALEMENT_RESOLU' AS activity_type, 'Signalement résolu' AS title,
      CONCAT('Résolu : ', s.type_probleme, ' - Chambre ', l.numero_chambre) AS description,
      s.date_resolution AS timestamp,
      JSON_BUILD_OBJECT('signalement_id', s.id, 'type_probleme', s.type_probleme,
        'chambre', l.numero_chambre, 'numero_chambre', l.numero_chambre, 'centre_nom', c.nom) AS metadata
     FROM signalements s
     JOIN attributions a ON s.attribution_id = a.id
     JOIN utilisateurs u ON a.utilisateur_id = u.id
     JOIN logements l ON a.logement_id = l.id
     JOIN centres c ON l.centre_id = c.id
     WHERE s.statut = 'RESOLU' AND s.date_resolution IS NOT NULL
       ${scoped ? 'AND l.centre_id = $5' : ''}
     ORDER BY s.date_resolution DESC LIMIT $2)
    UNION ALL
    (SELECT 'USER_CREATE' AS activity_type, 'Nouvel utilisateur' AS title,
      CONCAT('Inscription: ', u.prenom, ' ', u.nom, ' (', u.role, ')') AS description,
      u.created_at AS timestamp,
      JSON_BUILD_OBJECT('user_id', u.id, 'role', u.role, 'matricule', u.matricule,
        'utilisateur', CONCAT(u.prenom, ' ', u.nom)) AS metadata
     FROM utilisateurs u
     WHERE u.role IN ('ETUDIANT', 'GESTIONNAIRE')
       ${scoped ? `AND EXISTS (
         SELECT 1 FROM attributions a JOIN logements l ON a.logement_id = l.id
         WHERE a.utilisateur_id = u.id AND a.statut = 'ACTIVE' AND l.centre_id = $5
       )` : ''}
     ORDER BY u.created_at DESC LIMIT $3)
    ORDER BY timestamp DESC NULLS LAST
    LIMIT $4
  `, params);

  return r.rows;
};

module.exports = { statistiques, graphiques, activiteRecente };
