/**
 * Logique métier : génération de rapports PDF/Excel (financier, occupation).
 * Applique le cloisonnement par centre (un gestionnaire est limité au sien).
 */
const rapportRepository = require('../repositories/rapportRepository');
const {
  generateFinancialReportPDF, generateOccupationReportPDF,
} = require('../utils/pdfGenerator');
const {
  generateFinancialReportExcel, generateOccupationReportExcel,
} = require('../utils/excelGenerator');

const CONTENT_TYPES = {
  pdf: 'application/pdf',
  excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/** Retourne { filePath, fileName, contentType } prêt au téléchargement */
const genererFinancier = async ({ format, periode, date_debut, date_fin, centre_id }, centreScope) => {
  // Cloisonnement : un gestionnaire ne peut viser que son propre centre
  const centreEffectif = centreScope !== null ? centreScope : centre_id;
  const filtres = { periode, date_debut, date_fin, centre_id: centreEffectif };

  const reportData = await rapportRepository.donneesFinancier(filtres);
  const options = {
    periode: periode || 'Personnalisée',
    centre: await rapportRepository.nomCentre(centreEffectif),
  };

  const result = format === 'pdf'
    ? await generateFinancialReportPDF(reportData, options)
    : await generateFinancialReportExcel(reportData, options);

  return { ...result, contentType: CONTENT_TYPES[format] };
};

const genererOccupation = async ({ format, centre_id }, centreScope) => {
  const centreEffectif = centreScope !== null ? centreScope : centre_id;

  const reportData = await rapportRepository.donneesOccupation(centreEffectif);
  const options = { centre: await rapportRepository.nomCentre(centreEffectif) };

  const result = format === 'pdf'
    ? await generateOccupationReportPDF(reportData, options)
    : await generateOccupationReportExcel(reportData, options);

  return { ...result, contentType: CONTENT_TYPES[format] };
};

module.exports = { genererFinancier, genererOccupation };
