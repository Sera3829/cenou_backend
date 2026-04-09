const db = require('../config/database');
const { db: firebaseDb, isFirebaseAvailable } = require('../config/firebase');

/**
 * Récupérer les statistiques du dashboard admin
 * GET /api/admin/dashboard/stats
 */
exports.getDashboardStats = async (req, res) => {
  try {
    console.log('📊 Récupération statistiques dashboard...');

    // 1. Statistiques générales
    const generalStats = await db.query(`
      SELECT 
        (SELECT COUNT(*) FROM utilisateurs WHERE role = 'ETUDIANT' AND statut = 'ACTIF') as total_etudiants,
        (SELECT COUNT(*) FROM utilisateurs WHERE role = 'GESTIONNAIRE' AND statut = 'ACTIF') as total_gestionnaires,
        (SELECT COUNT(*) FROM utilisateurs WHERE role = 'ADMIN' AND statut = 'ACTIF') as total_admins,
        (SELECT COUNT(*) FROM centres) as total_centres,
        (SELECT COUNT(*) FROM logements) as total_logements,
        (SELECT COUNT(*) FROM logements WHERE statut = 'OCCUPE') as logements_occupes,
        (SELECT COUNT(*) FROM logements WHERE statut = 'DISPONIBLE') as logements_disponibles
    `);

    // 2. Statistiques paiements
    const paiementStats = await db.query(`
      SELECT 
        COUNT(*) as total_paiements,
        COUNT(CASE WHEN statut = 'CONFIRME' THEN 1 END) as paiements_confirme,
        COUNT(CASE WHEN statut = 'EN_ATTENTE' THEN 1 END) as paiements_en_attente,
        COUNT(CASE WHEN statut = 'ECHEC' THEN 1 END) as paiements_echec,
        COALESCE(SUM(CASE WHEN statut = 'CONFIRME' THEN montant ELSE 0 END), 0) as montant_total,
        COALESCE(AVG(CASE WHEN statut = 'CONFIRME' THEN montant END), 0) as montant_moyen,
        COALESCE(SUM(CASE WHEN statut = 'CONFIRME' AND date_paiement >= CURRENT_DATE - INTERVAL '30 days' THEN montant ELSE 0 END), 0) as montant_30jours
      FROM paiements
    `);

    // 3. Statistiques signalements
    const signalementStats = await db.query(`
      SELECT 
        COUNT(*) as total_signalements,
        COUNT(CASE WHEN statut = 'EN_ATTENTE' THEN 1 END) as signalements_en_attente,
        COUNT(CASE WHEN statut = 'EN_COURS' THEN 1 END) as signalements_en_cours,
        COUNT(CASE WHEN statut = 'RESOLU' THEN 1 END) as signalements_resolus,
        COUNT(CASE WHEN statut = 'ANNULE' THEN 1 END) as signalements_annules,
        ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(date_resolution, CURRENT_TIMESTAMP) - created_at)) / 86400), 1) as duree_moyenne_jours,
        COUNT(DISTINCT type_probleme) as types_problemes_differents
      FROM signalements
    `);

    // 4. Répartition par centre
    const centreStats = await db.query(`
      SELECT 
        c.id,
        c.nom,
        c.ville,
        COUNT(DISTINCT a.utilisateur_id) as etudiants_count,
        COUNT(DISTINCT l.id) as logements_count,
        COUNT(DISTINCT CASE WHEN a.statut = 'ACTIVE' THEN a.id END) as attributions_actives,
        COALESCE(SUM(CASE WHEN p.statut = 'CONFIRME' THEN p.montant ELSE 0 END), 0) as revenus_total
      FROM centres c
      LEFT JOIN logements l ON c.id = l.centre_id
      LEFT JOIN attributions a ON l.id = a.logement_id
      LEFT JOIN paiements p ON a.id = p.attribution_id
      GROUP BY c.id, c.nom, c.ville
      ORDER BY c.nom
    `);

    // 5. Dernières activités
const recentActivity = await db.query(`
  (SELECT 
    'PAIEMENT' as type,
    'Paiement confirmé' as action,
    CONCAT(u.prenom, ' ', u.nom) as user,
    p.montant::TEXT as details,
    p.date_paiement as timestamp,
    p.id as reference_id
  FROM paiements p
  JOIN attributions a ON p.attribution_id = a.id
  JOIN utilisateurs u ON a.utilisateur_id = u.id
  WHERE p.statut = 'CONFIRME'
  ORDER BY p.date_paiement DESC
  LIMIT 5)
  
  UNION ALL
  
  (SELECT 
    'SIGNALEMENT' as type,
    CONCAT('Signalement ', s.type_probleme) as action,
    CONCAT(u.prenom, ' ', u.nom) as user,
    l.numero_chambre::TEXT as details,
    s.created_at as timestamp,
    s.id as reference_id
  FROM signalements s
  JOIN attributions a ON s.attribution_id = a.id
  JOIN utilisateurs u ON a.utilisateur_id = u.id
  JOIN logements l ON a.logement_id = l.id
  ORDER BY s.created_at DESC
  LIMIT 5)
  
  UNION ALL
  
  (SELECT 
    'INSCRIPTION' as type,
    'Nouvel étudiant' as action,
    CONCAT(prenom, ' ', nom) as user,
    matricule::TEXT as details,
    created_at as timestamp,
    id as reference_id
  FROM utilisateurs
  WHERE role = 'ETUDIANT'
  ORDER BY created_at DESC
  LIMIT 5)
  
  ORDER BY timestamp DESC
  LIMIT 15
`);

    res.json({
      success: true,
      data: {
        general: generalStats.rows[0],
        paiements: paiementStats.rows[0],
        signalements: signalementStats.rows[0],
        centres: centreStats.rows,
        recent_activity: recentActivity.rows,
        generated_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Erreur récupération statistiques dashboard:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des statistiques',
      details: error.message
    });
  }
};

/**
 * Récupérer les données pour les graphiques
 * GET /api/admin/dashboard/charts
 */
exports.getChartsData = async (req, res) => {
  try {
    const { period = 'month', centre_id } = req.query;
    
    // Validation de la période
    const validPeriods = ['day', 'week', 'month', 'year'];
    const chartPeriod = validPeriods.includes(period) ? period : 'month';

    // 1. Graphique paiements par période
    const paiementsChart = await db.query(`
      SELECT 
        DATE_TRUNC('${chartPeriod}', date_paiement) as period,
        COUNT(*) as count,
        COALESCE(SUM(montant), 0) as total,
        mode_paiement
      FROM paiements
      WHERE statut = 'CONFIRME'
        AND date_paiement >= CURRENT_DATE - INTERVAL '6 ${chartPeriod}s'
        ${centre_id ? 'AND EXISTS (SELECT 1 FROM attributions a JOIN logements l ON a.logement_id = l.id WHERE a.id = paiements.attribution_id AND l.centre_id = $1)' : ''}
      GROUP BY DATE_TRUNC('${chartPeriod}', date_paiement), mode_paiement
      ORDER BY period, mode_paiement
    `, centre_id ? [centre_id] : []);

    // 2. Graphique signalements par période
    const signalementsChart = await db.query(`
      SELECT 
        DATE_TRUNC('${chartPeriod}', created_at) as period,
        statut,
        COUNT(*) as count
      FROM signalements
      WHERE created_at >= CURRENT_DATE - INTERVAL '6 ${chartPeriod}s'
        ${centre_id ? 'AND EXISTS (SELECT 1 FROM attributions a JOIN logements l ON a.logement_id = l.id WHERE a.id = signalements.attribution_id AND l.centre_id = $1)' : ''}
      GROUP BY DATE_TRUNC('${chartPeriod}', created_at), statut
      ORDER BY period, statut
    `, centre_id ? [centre_id] : []);

    // 3. Distribution des types de signalements
    const signalementsTypes = await db.query(`
      SELECT 
        type_probleme,
        COUNT(*) as count,
        COUNT(CASE WHEN statut = 'RESOLU' THEN 1 END) as resolved,
        COUNT(CASE WHEN statut = 'EN_ATTENTE' THEN 1 END) as pending,
        COUNT(CASE WHEN statut = 'EN_COURS' THEN 1 END) as in_progress,
        ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(date_resolution, CURRENT_TIMESTAMP) - created_at)) / 86400), 1) as avg_duration_days
      FROM signalements
      ${centre_id ? 'WHERE EXISTS (SELECT 1 FROM attributions a JOIN logements l ON a.logement_id = l.id WHERE a.id = signalements.attribution_id AND l.centre_id = $1)' : ''}
      GROUP BY type_probleme
      ORDER BY count DESC
    `, centre_id ? [centre_id] : []);

    // 4. Occupation par centre
    const occupationChart = await db.query(`
      SELECT 
        c.nom as centre,
        COUNT(l.id) as total_logements,
        COUNT(CASE WHEN l.statut = 'OCCUPE' THEN 1 END) as logements_occupes,
        COUNT(CASE WHEN l.statut = 'DISPONIBLE' THEN 1 END) as logements_disponibles,
        COUNT(CASE WHEN l.statut = 'MAINTENANCE' THEN 1 END) as logements_maintenance,
        ROUND(COUNT(CASE WHEN l.statut = 'OCCUPE' THEN 1 END) * 100.0 / NULLIF(COUNT(l.id), 0), 1) as taux_occupation
      FROM centres c
      LEFT JOIN logements l ON c.id = l.centre_id
      GROUP BY c.id, c.nom
      ORDER BY taux_occupation DESC
    `);

    res.json({
      success: true,
      data: {
        paiements: paiementsChart.rows,
        signalements: signalementsChart.rows,
        signalements_types: signalementsTypes.rows,
        occupation: occupationChart.rows,
        period: chartPeriod
      }
    });

  } catch (error) {
    console.error('❌ Erreur récupération données graphiques:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des données graphiques'
    });
  }
};

/**
 * Récupérer l'activité récente
 * GET /api/admin/dashboard/recent-activity
 */
exports.getRecentActivity = async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const half  = Math.floor(parseInt(limit) / 2);
    const qrtr  = Math.floor(parseInt(limit) / 4);
    const total = parseInt(limit);
 
    const activity = await db.query(`
      -- ── Paiements confirmés ──────────────────────────────────────────
      (SELECT
        'PAIEMENT_CONFIRME'                          AS activity_type,
        'Paiement confirmé'                          AS title,
        CONCAT('Paiement de ', p.montant, ' FCFA - Chambre ', l.numero_chambre) AS description,
        p.date_paiement                              AS timestamp,
        JSON_BUILD_OBJECT(
          'paiement_id',    p.id,
          'user_id',        u.id,
          'montant',        p.montant,
          'mode_paiement',  p.mode_paiement,
          'chambre',        l.numero_chambre,         -- ← chambre exposée
          'numero_chambre', l.numero_chambre,
          'centre_nom',     c.nom
        ) AS metadata
       FROM paiements p
       JOIN attributions a ON p.attribution_id = a.id
       JOIN utilisateurs u ON a.utilisateur_id  = u.id
       JOIN logements    l ON a.logement_id      = l.id   -- ← JOIN ajouté
       JOIN centres      c ON l.centre_id         = c.id  -- ← JOIN ajouté
       WHERE p.statut = 'CONFIRME'
       ORDER BY p.date_paiement DESC
       LIMIT $1)
 
      UNION ALL
 
      -- ── Paiements initiés ────────────────────────────────────────────
      (SELECT
        'PAIEMENT_INITIE'                            AS activity_type,
        'Paiement initié'                            AS title,
        CONCAT('Paiement de ', p.montant, ' FCFA - Chambre ', l.numero_chambre) AS description,
        p.created_at                                 AS timestamp,
        JSON_BUILD_OBJECT(
          'paiement_id',    p.id,
          'user_id',        u.id,
          'montant',        p.montant,
          'mode_paiement',  p.mode_paiement,
          'chambre',        l.numero_chambre,
          'numero_chambre', l.numero_chambre,
          'centre_nom',     c.nom
        ) AS metadata
       FROM paiements p
       JOIN attributions a ON p.attribution_id = a.id
       JOIN utilisateurs u ON a.utilisateur_id  = u.id
       JOIN logements    l ON a.logement_id      = l.id
       JOIN centres      c ON l.centre_id         = c.id
       WHERE p.statut = 'EN_ATTENTE'
       ORDER BY p.created_at DESC
       LIMIT $1)
 
      UNION ALL
 
      -- ── Signalements créés ───────────────────────────────────────────
      (SELECT
        'SIGNALEMENT_CREATE'                         AS activity_type,
        'Nouveau signalement'                        AS title,
        CONCAT('Signalement ', s.type_probleme, ' - Chambre ', l.numero_chambre) AS description,
        s.created_at                                 AS timestamp,
        JSON_BUILD_OBJECT(
          'signalement_id', s.id,
          'user_id',        u.id,
          'type_probleme',  s.type_probleme,
          'statut',         s.statut,
          'chambre',        l.numero_chambre,        -- ← chambre exposée
          'numero_chambre', l.numero_chambre,
          'centre_nom',     c.nom
        ) AS metadata
       FROM signalements s
       JOIN attributions a ON s.attribution_id = a.id
       JOIN utilisateurs u ON a.utilisateur_id  = u.id
       JOIN logements    l ON a.logement_id      = l.id   -- ← JOIN ajouté
       JOIN centres      c ON l.centre_id         = c.id  -- ← JOIN ajouté
       ORDER BY s.created_at DESC
       LIMIT $1)
 
      UNION ALL
 
      -- ── Signalements résolus ─────────────────────────────────────────
      (SELECT
        'SIGNALEMENT_RESOLU'                         AS activity_type,
        'Signalement résolu'                         AS title,
        CONCAT('Résolu : ', s.type_probleme, ' - Chambre ', l.numero_chambre) AS description,
        s.date_resolution                            AS timestamp,
        JSON_BUILD_OBJECT(
          'signalement_id', s.id,
          'type_probleme',  s.type_probleme,
          'chambre',        l.numero_chambre,
          'numero_chambre', l.numero_chambre,
          'centre_nom',     c.nom
        ) AS metadata
       FROM signalements s
       JOIN attributions a ON s.attribution_id = a.id
       JOIN utilisateurs u ON a.utilisateur_id  = u.id
       JOIN logements    l ON a.logement_id      = l.id
       JOIN centres      c ON l.centre_id         = c.id
       WHERE s.statut = 'RESOLU'
         AND s.date_resolution IS NOT NULL
       ORDER BY s.date_resolution DESC
       LIMIT $2)
 
      UNION ALL
 
      -- ── Nouveaux utilisateurs ────────────────────────────────────────
      (SELECT
        'USER_CREATE'                                AS activity_type,
        'Nouvel utilisateur'                         AS title,
        CONCAT('Inscription: ', u.prenom, ' ', u.nom, ' (', u.role, ')') AS description,
        u.created_at                                 AS timestamp,
        JSON_BUILD_OBJECT(
          'user_id',    u.id,
          'role',       u.role,
          'matricule',  u.matricule,
          'utilisateur', CONCAT(u.prenom, ' ', u.nom)
        ) AS metadata
       FROM utilisateurs u
       WHERE u.role IN ('ETUDIANT', 'GESTIONNAIRE')
       ORDER BY u.created_at DESC
       LIMIT $3)
 
      ORDER BY timestamp DESC NULLS LAST
      LIMIT $4
    `, [half, qrtr, qrtr, total]);
 
    res.json({
      success: true,
      data: {
        activities: activity.rows,
        total: activity.rows.length,
      },
    });
 
  } catch (error) {
    console.error('❌ Erreur récupération activité récente:', error);
    res.status(500).json({
      success: false,
      error: "Erreur lors de la récupération de l'activité récente",
    });
  }
};

/**
 * Générer un rapport financier
 * GET /api/admin/reports/financial
 */
exports.getFinancialReport = async (req, res) => {
  try {
    const { 
      date_from, 
      date_to, 
      centre_id,
      statut = 'CONFIRME',
      format = 'json'
    } = req.query;

    let query = `
      SELECT 
        p.id,
        p.montant,
        p.date_paiement,
        p.date_echeance,
        p.mode_paiement,
        p.statut,
        p.reference_transaction,
        p.created_at,
        u.id as user_id,
        u.matricule,
        u.nom,
        u.prenom,
        u.email,
        u.telephone,
        l.numero_chambre,
        l.type_chambre,
        l.prix_mensuel,
        c.id as centre_id,
        c.nom as centre_nom,
        c.ville as centre_ville
      FROM paiements p
      JOIN attributions a ON p.attribution_id = a.id
      JOIN utilisateurs u ON a.utilisateur_id = u.id
      JOIN logements l ON a.logement_id = l.id
      JOIN centres c ON l.centre_id = c.id
      WHERE p.statut = $1
    `;

    const params = [statut];
    let paramIndex = 2;

    if (date_from) {
      query += ` AND p.date_paiement >= $${paramIndex}`;
      params.push(date_from);
      paramIndex++;
    }

    if (date_to) {
      query += ` AND p.date_paiement <= $${paramIndex}`;
      params.push(date_to);
      paramIndex++;
    }

    if (centre_id) {
      query += ` AND c.id = $${paramIndex}`;
      params.push(centre_id);
      paramIndex++;
    }

    query += ` ORDER BY p.date_paiement DESC`;

    const result = await db.query(query, params);

    // Calculer les totaux
    const totalsQuery = `
      SELECT 
        COUNT(*) as count_paiements,
        COALESCE(SUM(montant), 0) as montant_total,
        COUNT(DISTINCT a.utilisateur_id) as count_etudiants,
        COUNT(DISTINCT c.id) as count_centres,
        AVG(montant) as montant_moyen,
        MIN(date_paiement) as date_premier,
        MAX(date_paiement) as date_dernier
      FROM paiements p
      JOIN attributions a ON p.attribution_id = a.id
      JOIN logements l ON a.logement_id = l.id
      JOIN centres c ON l.centre_id = c.id
      WHERE p.statut = $1
      ${date_from ? `AND p.date_paiement >= '${date_from}'` : ''}
      ${date_to ? `AND p.date_paiement <= '${date_to}'` : ''}
      ${centre_id ? `AND c.id = ${centre_id}` : ''}
    `;

    const totals = await db.query(totalsQuery, [statut]);

    // Par mode de paiement
    const byModeQuery = `
      SELECT 
        mode_paiement,
        COUNT(*) as count,
        COALESCE(SUM(montant), 0) as total
      FROM paiements
      WHERE statut = $1
      ${date_from ? `AND date_paiement >= '${date_from}'` : ''}
      ${date_to ? `AND date_paiement <= '${date_to}'` : ''}
      GROUP BY mode_paiement
      ORDER BY total DESC
    `;

    const byMode = await db.query(byModeQuery, [statut]);

    // Par centre
    const byCentreQuery = `
      SELECT 
        c.nom as centre,
        c.ville,
        COUNT(p.id) as count_paiements,
        COALESCE(SUM(p.montant), 0) as total
      FROM paiements p
      JOIN attributions a ON p.attribution_id = a.id
      JOIN logements l ON a.logement_id = l.id
      JOIN centres c ON l.centre_id = c.id
      WHERE p.statut = $1
      ${date_from ? `AND p.date_paiement >= '${date_from}'` : ''}
      ${date_to ? `AND p.date_paiement <= '${date_to}'` : ''}
      GROUP BY c.id, c.nom, c.ville
      ORDER BY total DESC
    `;

    const byCentre = await db.query(byCentreQuery, [statut]);

    const reportData = {
      paiements: result.rows,
      summary: {
        ...totals.rows[0],
        by_mode: byMode.rows,
        by_centre: byCentre.rows
      },
      filters: {
        date_from,
        date_to,
        centre_id,
        statut
      },
      generated_at: new Date().toISOString(),
      generated_by: req.user?.id || 'system'
    };

    if (format === 'csv') {
      // Générer CSV
      const csv = generateCSV(reportData);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=rapport_financier.csv');
      return res.send(csv);
    }

    if (format === 'pdf') {
      // Générer PDF
      // À implémenter avec une librairie PDF
      return res.status(501).json({
        success: false,
        error: 'Format PDF non implémenté pour le moment'
      });
    }

    // Format JSON par défaut
    res.json({
      success: true,
      data: reportData
    });

  } catch (error) {
    console.error('❌ Erreur génération rapport financier:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la génération du rapport financier'
    });
  }
};

/**
 * Générer un rapport utilisateurs
 * GET /api/admin/reports/users
 */
exports.getUsersReport = async (req, res) => {
  try {
    const { role, statut, centre_id, format = 'json' } = req.query;

    let query = `
      SELECT 
        u.id,
        u.matricule,
        u.nom,
        u.prenom,
        u.email,
        u.telephone,
        u.role,
        u.statut,
        u.created_at,
        u.updated_at,
        c.id as centre_id,
        c.nom as centre_nom,
        l.id as logement_id,
        l.numero_chambre,
        l.type_chambre,
        l.prix_mensuel,
        a.date_debut,
        a.date_fin,
        a.statut as attribution_statut,
        (
          SELECT COUNT(*) 
          FROM paiements p 
          JOIN attributions a2 ON p.attribution_id = a2.id 
          WHERE a2.utilisateur_id = u.id AND p.statut = 'CONFIRME'
        ) as paiements_count,
        (
          SELECT COALESCE(SUM(montant), 0)
          FROM paiements p 
          JOIN attributions a2 ON p.attribution_id = a2.id 
          WHERE a2.utilisateur_id = u.id AND p.statut = 'CONFIRME'
        ) as paiements_total,
        (
          SELECT COUNT(*) 
          FROM signalements s 
          JOIN attributions a3 ON s.attribution_id = a3.id 
          WHERE a3.utilisateur_id = u.id
        ) as signalements_count,
        (
          SELECT COUNT(*) 
          FROM signalements s 
          JOIN attributions a3 ON s.attribution_id = a3.id 
          WHERE a3.utilisateur_id = u.id AND s.statut = 'RESOLU'
        ) as signalements_resolus
      FROM utilisateurs u
      LEFT JOIN attributions a ON u.id = a.utilisateur_id AND a.statut = 'ACTIVE'
      LEFT JOIN logements l ON a.logement_id = l.id
      LEFT JOIN centres c ON l.centre_id = c.id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (role) {
      query += ` AND u.role = $${paramIndex}`;
      params.push(role);
      paramIndex++;
    }

    if (statut) {
      query += ` AND u.statut = $${paramIndex}`;
      params.push(statut);
      paramIndex++;
    }

    if (centre_id) {
      query += ` AND c.id = $${paramIndex}`;
      params.push(centre_id);
      paramIndex++;
    }

    query += ` ORDER BY u.created_at DESC`;

    const result = await db.query(query, params);

    // Statistiques
    const statsQuery = `
      SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN role = 'ETUDIANT' THEN 1 END) as etudiants,
        COUNT(CASE WHEN role = 'GESTIONNAIRE' THEN 1 END) as gestionnaires,
        COUNT(CASE WHEN role = 'ADMIN' THEN 1 END) as admins,
        COUNT(CASE WHEN statut = 'ACTIF' THEN 1 END) as actifs,
        COUNT(CASE WHEN statut = 'INACTIF' THEN 1 END) as inactifs,
        COUNT(CASE WHEN statut = 'SUSPENDU' THEN 1 END) as suspendus,
        MIN(created_at) as date_premiere_inscription,
        MAX(created_at) as date_derniere_inscription
      FROM utilisateurs
      ${params.length > 0 ? 'WHERE ' + query.split('WHERE')[1].split('ORDER BY')[0] : ''}
    `;

    const stats = await db.query(
      statsQuery, 
      params.length > 0 ? params : []
    );

    const reportData = {
      users: result.rows,
      statistics: stats.rows[0],
      filters: { role, statut, centre_id },
      generated_at: new Date().toISOString(),
      total: result.rows.length
    };

    // Gestion des formats
    if (format === 'csv') {
      const csv = generateUsersCSV(reportData);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=rapport_utilisateurs.csv');
      return res.send(csv);
    }

    res.json({
      success: true,
      data: reportData
    });

  } catch (error) {
    console.error('❌ Erreur génération rapport utilisateurs:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la génération du rapport utilisateurs'
    });
  }
};

/**
 * Créer une annonce (admin seulement)
 * POST /api/admin/annonces
 */
exports.createAnnouncement = async (req, res) => {
  const client = await db.getClient();
  
  try {
    const { titre, contenu, cible, centre_id, date_publication, date_expiration } = req.body;
    const created_by = req.user.id;

    await client.query('BEGIN');

    const result = await client.query(`
      INSERT INTO annonces (titre, contenu, cible, centre_id, created_by, date_publication, date_expiration, statut)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'PUBLIE')
      RETURNING id, titre, contenu, cible, centre_id, created_at, statut
    `, [
      titre, 
      contenu, 
      cible, 
      centre_id || null, 
      created_by,
      date_publication || new Date(),
      date_expiration
    ]);

    const announcement = result.rows[0];

    // Si l'annonce est ciblée, envoyer des notifications
    if (cible !== 'TOUS' && isFirebaseAvailable()) {
      await sendAnnouncementNotifications(announcement.id, cible, centre_id);
    }

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      data: announcement,
      message: 'Annonce créée avec succès'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Erreur création annonce:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la création de l\'annonce'
    });
  } finally {
    client.release();
  }
};

// Fonctions helpers
function generateCSV(data) {
  const headers = ['ID', 'Matricule', 'Nom', 'Prénom', 'Montant', 'Date Paiement', 'Mode', 'Statut', 'Chambre', 'Centre'];
  const rows = data.paiements.map(p => [
    p.id,
    p.matricule,
    p.nom,
    p.prenom,
    p.montant,
    p.date_paiement,
    p.mode_paiement,
    p.statut,
    p.numero_chambre,
    p.centre_nom
  ]);
  
  return [headers, ...rows].map(row => row.join(',')).join('\n');
}

function generateUsersCSV(data) {
  const headers = ['ID', 'Matricule', 'Nom', 'Prénom', 'Email', 'Téléphone', 'Rôle', 'Statut', 'Centre', 'Chambre', 'Date Inscription'];
  const rows = data.users.map(u => [
    u.id,
    u.matricule,
    u.nom,
    u.prenom,
    u.email,
    u.telephone,
    u.role,
    u.statut,
    u.centre_nom || 'N/A',
    u.numero_chambre || 'N/A',
    u.created_at
  ]);
  
  return [headers, ...rows].map(row => row.join(',')).join('\n');
}

async function sendAnnouncementNotifications(announcementId, target, centreId) {
  try {
    let userIds = [];
    
    if (target === 'ETUDIANTS') {
      const result = await db.query(`
        SELECT DISTINCT a.utilisateur_id 
        FROM attributions a
        JOIN utilisateurs u ON a.utilisateur_id = u.id
        WHERE u.role = 'ETUDIANT' AND u.statut = 'ACTIF'
        ${centreId ? 'AND EXISTS (SELECT 1 FROM logements l WHERE l.id = a.logement_id AND l.centre_id = $1)' : ''}
      `, centreId ? [centreId] : []);
      
      userIds = result.rows.map(r => r.utilisateur_id);
    } else if (target === 'GESTIONNAIRES') {
      const result = await db.query(`
        SELECT id FROM utilisateurs 
        WHERE role = 'GESTIONNAIRE' AND statut = 'ACTIF'
      `);
      
      userIds = result.rows.map(r => r.id);
    }
    
    // Envoyer les notifications via Firebase
    for (const userId of userIds) {
      await firebaseDb.collection('notifications').add({
        userId,
        type: 'ANNONCE',
        title: 'Nouvelle annonce',
        message: 'Une nouvelle annonce a été publiée',
        data: { announcementId },
        read: false,
        createdAt: new Date().toISOString()
      });
    }
    
    console.log(`📢 Notifications envoyées à ${userIds.length} utilisateurs`);
    
  } catch (error) {
    console.error('❌ Erreur envoi notifications annonce:', error);
  }
}