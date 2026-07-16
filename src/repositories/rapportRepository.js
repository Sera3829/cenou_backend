/**
 * Accès aux données : rapports PDF/Excel (financier, occupation).
 * La logique de filtre de période (mois en cours / dernier / plage) est
 * factorisée et paramétrée.
 */
const db = require('../config/database');

/**
 * Construit les conditions de filtre paiement (centre + période).
 * @param {Object} filtres { centre_id, date_debut, date_fin, periode }
 * @param {Array} baseConditions conditions initiales (ex: ['p.statut = $1'])
 * @param {Array} baseParams paramètres initiaux
 * @returns {{ where, params }}
 */
const _filtresPaiement = (filtres, baseConditions = [], baseParams = []) => {
  const { centre_id, date_debut, date_fin, periode } = filtres;
  const conditions = [...baseConditions];
  const params = [...baseParams];
  let i = params.length + 1;

  if (centre_id) {
    conditions.push(`c.id = $${i}`);
    params.push(centre_id);
    i++;
  }
  if (date_debut && date_fin) {
    conditions.push(`p.date_paiement BETWEEN $${i} AND $${i + 1}`);
    params.push(date_debut, date_fin);
    i += 2;
  } else if (periode === 'mois_en_cours') {
    conditions.push('EXTRACT(MONTH FROM p.date_paiement) = EXTRACT(MONTH FROM CURRENT_DATE)');
    conditions.push('EXTRACT(YEAR FROM p.date_paiement) = EXTRACT(YEAR FROM CURRENT_DATE)');
  } else if (periode === 'mois_dernier') {
    conditions.push("EXTRACT(MONTH FROM p.date_paiement) = EXTRACT(MONTH FROM CURRENT_DATE - INTERVAL '1 month')");
    conditions.push("EXTRACT(YEAR FROM p.date_paiement) = EXTRACT(YEAR FROM CURRENT_DATE - INTERVAL '1 month')");
  }

  return { where: conditions.length ? conditions.join(' AND ') : '1=1', params };
};

const JOINS = `
  JOIN attributions a ON p.attribution_id = a.id
  JOIN logements l ON a.logement_id = l.id
  JOIN centres c ON l.centre_id = c.id`;

const nomCentre = async (centreId, exec = db) => {
  if (!centreId) return 'Tous les centres';
  const r = await exec.query('SELECT nom FROM centres WHERE id = $1', [centreId]);
  return r.rows[0]?.nom || 'Tous les centres';
};

const donneesFinancier = async (filtres, exec = db) => {
  const confirme = _filtresPaiement(filtres, ['p.statut = $1'], ['CONFIRME']);
  const enAttente = _filtresPaiement(filtres, ['p.statut = $1'], ['EN_ATTENTE']);
  const impayes = _filtresPaiement(filtres, ['p.statut = $1', 'p.date_echeance < CURRENT_DATE'], ['EN_ATTENTE']);
  const periodeSeule = _filtresPaiement(filtres, [], []); // sans statut

  const stats = await exec.query(
    `SELECT COUNT(*) as total_paiements, COALESCE(SUM(p.montant::numeric), 0) as montant_total
     FROM paiements p ${JOINS} WHERE ${confirme.where}`, confirme.params);

  const enAttenteRes = await exec.query(
    `SELECT COUNT(*) as paiements_en_attente, COALESCE(SUM(p.montant::numeric), 0) as montant_en_attente
     FROM paiements p ${JOINS} WHERE ${enAttente.where}`, enAttente.params);

  const impayesRes = await exec.query(
    `SELECT COUNT(*) as impayés FROM paiements p ${JOINS} WHERE ${impayes.where}`, impayes.params);

  const parMode = await exec.query(
    `SELECT p.mode_paiement, COUNT(*) as nombre, COALESCE(SUM(p.montant::numeric), 0) as montant_total
     FROM paiements p ${JOINS} WHERE ${confirme.where}
     GROUP BY p.mode_paiement ORDER BY montant_total DESC`, confirme.params);

  const parStatut = await exec.query(
    `SELECT p.statut, COUNT(*) as nombre
     FROM paiements p ${JOINS} WHERE ${periodeSeule.where}
     GROUP BY p.statut ORDER BY nombre DESC`, periodeSeule.params);

  const parMois = await exec.query(
    `SELECT TO_CHAR(p.date_paiement, 'YYYY-MM') as mois, COUNT(*) as nombre,
            COALESCE(SUM(p.montant::numeric), 0) as montant_total
     FROM paiements p ${JOINS}
     WHERE p.statut = 'CONFIRME' AND p.date_paiement >= CURRENT_DATE - INTERVAL '3 months'
       ${filtres.centre_id ? 'AND c.id = $1' : ''}
     GROUP BY TO_CHAR(p.date_paiement, 'YYYY-MM') ORDER BY mois DESC`,
    filtres.centre_id ? [filtres.centre_id] : []);

  const paiements = await exec.query(
    `SELECT p.id, u.matricule, u.nom, u.prenom, l.numero_chambre, c.nom as centre_nom,
            p.montant::numeric as montant, p.mode_paiement, p.date_paiement, p.statut
     FROM paiements p ${JOINS}
     JOIN utilisateurs u ON a.utilisateur_id = u.id
     WHERE ${periodeSeule.where}
     ORDER BY p.date_paiement DESC LIMIT 1000`, periodeSeule.params);

  const montantTotal = Number(stats.rows[0].montant_total || 0);
  const montantAttente = Number(enAttenteRes.rows[0].montant_en_attente || 0);
  const totalAttendus = montantTotal + montantAttente;
  const tauxRecouvrement = totalAttendus === 0 ? 0
    : Number(((montantTotal * 100) / totalAttendus).toFixed(2));

  return {
    statistiques: {
      total_paiements: Number(stats.rows[0].total_paiements),
      montant_total: montantTotal,
      paiements_en_attente: Number(enAttenteRes.rows[0].paiements_en_attente),
      montant_en_attente: montantAttente,
      impayés: Number(impayesRes.rows[0].impayés),
      taux_recouvrement: tauxRecouvrement,
    },
    par_mode_paiement: parMode.rows,
    par_statut: parStatut.rows,
    par_mois: parMois.rows,
    paiements: paiements.rows,
  };
};

const donneesOccupation = async (centreId, exec = db) => {
  const p = centreId ? [centreId] : [];
  const filtreCentre = centreId ? 'AND c.id = $1' : '';

  const statsRes = await exec.query(
    `SELECT COUNT(l.id) as total_logements,
       COUNT(CASE WHEN l.statut = 'OCCUPE' THEN 1 END) as logements_occupes,
       COUNT(CASE WHEN l.statut = 'DISPONIBLE' THEN 1 END) as logements_disponibles,
       COUNT(DISTINCT a.utilisateur_id) as total_residents
     FROM logements l
     LEFT JOIN attributions a ON l.id = a.logement_id AND a.statut = 'ACTIVE'
     LEFT JOIN centres c ON l.centre_id = c.id
     WHERE 1=1 ${filtreCentre}`, p);

  const stats = statsRes.rows[0];
  const tauxOccupation = stats.total_logements > 0
    ? ((stats.logements_occupes / stats.total_logements) * 100).toFixed(2)
    : 0;

  const parType = await exec.query(
    `SELECT l.type_chambre, COUNT(l.id) as total,
       COUNT(CASE WHEN l.statut = 'OCCUPE' THEN 1 END) as occupes,
       COUNT(CASE WHEN l.statut = 'DISPONIBLE' THEN 1 END) as disponibles,
       ROUND((COUNT(CASE WHEN l.statut = 'OCCUPE' THEN 1 END)::numeric / COUNT(l.id)::numeric) * 100, 2) as taux_occupation
     FROM logements l
     LEFT JOIN centres c ON l.centre_id = c.id
     WHERE 1=1 ${filtreCentre}
     GROUP BY l.type_chambre ORDER BY l.type_chambre`, p);

  const residents = await exec.query(
    `SELECT u.matricule, u.nom, u.prenom, l.numero_chambre, l.type_chambre, a.date_debut, a.date_fin
     FROM utilisateurs u
     JOIN attributions a ON u.id = a.utilisateur_id
     JOIN logements l ON a.logement_id = l.id
     JOIN centres c ON l.centre_id = c.id
     WHERE a.statut = 'ACTIVE' ${filtreCentre}
     ORDER BY u.nom, u.prenom LIMIT 1000`, p);

  return {
    statistiques: { ...stats, taux_occupation: tauxOccupation },
    par_type_chambre: parType.rows,
    residents: residents.rows,
  };
};

module.exports = { donneesFinancier, donneesOccupation, nomCentre };
