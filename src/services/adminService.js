/**
 * Logique métier : dashboard et rapports admin.
 * Cloisonnement par centre appliqué ici (scope = null | id de centre).
 */
const dashboardRepository = require('../repositories/dashboardRepository');
const reportRepository = require('../repositories/reportRepository');

const PERIODES_VALIDES = ['day', 'week', 'month', 'year'];

const statistiques = async (scope) => {
  const data = await dashboardRepository.statistiques(scope);
  return { ...data, generated_at: new Date().toISOString() };
};

const graphiques = (query, scope) => {
  const period = PERIODES_VALIDES.includes(query.period) ? query.period : 'month';
  const centreId = scope !== null ? scope : query.centre_id;
  return dashboardRepository.graphiques(period, centreId);
};

const activiteRecente = async (query, scope) => {
  const total = parseInt(query.limit) || 20;
  const bornes = { half: Math.floor(total / 2), qrtr: Math.floor(total / 4), total };
  const activities = await dashboardRepository.activiteRecente(scope, bornes);
  return { activities, total: activities.length };
};

const rapportFinancier = async (query, scope, generePar) => {
  const filtres = {
    statut: query.statut || 'CONFIRME',
    date_from: query.date_from,
    date_to: query.date_to,
    centre_id: scope !== null ? scope : query.centre_id,
  };
  const data = await reportRepository.rapportFinancier(filtres);
  return {
    ...data,
    filters: filtres,
    generated_at: new Date().toISOString(),
    generated_by: generePar || 'system',
  };
};

const rapportUtilisateurs = async (query, scope) => {
  const filtres = {
    role: query.role,
    statut: query.statut,
    centre_id: scope !== null ? scope : query.centre_id,
  };
  const data = await reportRepository.rapportUtilisateurs(filtres);
  return { ...data, filters: filtres, generated_at: new Date().toISOString(), total: data.users.length };
};

module.exports = {
  statistiques,
  graphiques,
  activiteRecente,
  rapportFinancier,
  rapportUtilisateurs,
};
