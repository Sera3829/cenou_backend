const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

// Dossier des rapports
const reportsDir = path.join(__dirname, '../../rapports');

// Créer le dossier rapports s'il n'existe pas
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

// ✅ Chemins des logos
// excelGenerator.js est dans backend/src/utils/
// Images dans backend/src/assets/images/
const LOGO_BURKINA = path.join(__dirname, '../assets/images/faso_drapeau.png');
const LOGO_CENOU = path.join(__dirname, '../assets/images/logo_cenou.png');

// ✅ Vérifier l'existence des logos au démarrage
console.log('🔍 Vérification des logos Excel:');
console.log('  Logo Burkina:', fs.existsSync(LOGO_BURKINA) ? '✅ Trouvé' : '❌ Manquant');
console.log('  Logo CENOU:', fs.existsSync(LOGO_CENOU) ? '✅ Trouvé' : '❌ Manquant');

/**
 * Ajouter l'en-tête officiel du MESRSI dans Excel
 */
async function addOfficialHeaderExcel(worksheet, workbook) {
  // Fusionner les cellules pour l'en-tête
  worksheet.mergeCells('A1:C14');
  worksheet.mergeCells('D1:F14');

  // Colonne gauche - Ministère
  const headerLeft = worksheet.getCell('A1');
  headerLeft.value = `MINISTERE DE L'ENSEIGNEMENT SUPERIEUR
DE LA RECHERCHE SCIENTIFIQUE ET DE
L'INNOVATION (MESRSI)
***********************
SECRETARIAT GENERAL
*******************
DIRECTION GENERALE DE L'ENSEIGNEMENT
SUPERIEUR
********************
DIRECTION DES INSTITUTIONS PRIVEES
D'ENSEIGNEMENT SUPERIEUR
******************`;
  
  headerLeft.font = { name: 'Arial', size: 9, bold: true };
  headerLeft.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };

  // Colonne droite - Burkina Faso avec devise
  const headerRight = worksheet.getCell('D1');
  headerRight.value = `Burkina Faso
*******************
La Patrie ou la Mort
nous Vaincrons`;
  headerRight.font = { name: 'Arial', size: 9, bold: true };
  headerRight.alignment = { vertical: 'top', horizontal: 'right', wrapText: true };

  // Ajouter le logo Burkina Faso
  if (fs.existsSync(LOGO_BURKINA)) {
    try {
      const imageBuffer = fs.readFileSync(LOGO_BURKINA);
      const burkImageId = workbook.addImage({
        buffer: imageBuffer,
        extension: 'png',
      });
      
      worksheet.addImage(burkImageId, {
        tl: { col: 5.2, row: 0.5 },
        ext: { width: 60, height: 60 },
      });
      console.log('✅ Logo Burkina inséré (Excel)');
    } catch (error) {
      console.error('❌ Erreur insertion logo Burkina (Excel):', error.message);
    }
  } else {
    console.warn('⚠️ Logo Burkina non trouvé:', LOGO_BURKINA);
  }

  // Ajouter le logo CENOU (centré)
  if (fs.existsSync(LOGO_CENOU)) {
    try {
      const imageBuffer = fs.readFileSync(LOGO_CENOU);
      const cenouImageId = workbook.addImage({
        buffer: imageBuffer,
        extension: 'png',
      });
      
      worksheet.addImage(cenouImageId, {
        tl: { col: 2.5, row: 15 },
        ext: { width: 80, height: 80 },
      });
      console.log('✅ Logo CENOU inséré (Excel)');
    } catch (error) {
      console.error('❌ Erreur insertion logo CENOU (Excel):', error.message);
    }
  } else {
    console.warn('⚠️ Logo CENOU non trouvé:', LOGO_CENOU);
  }

  // Centre National des Œuvres Universitaires
  worksheet.mergeCells('A19:F19');
  const cenouName = worksheet.getCell('A19');
  cenouName.value = 'Centre National des Œuvres Universitaires';
  cenouName.font = { name: 'Arial', size: 12, bold: true };
  cenouName.alignment = { horizontal: 'center', vertical: 'middle' };

  return 20; // Retourner la ligne de départ pour le contenu
}

/**
 * Générer un rapport financier en Excel professionnel
 * ✅ OPTIMISÉ avec toutes les corrections
 */
const generateFinancialReportExcel = async (data, options = {}) => {
  try {
    const fileName = `rapport_financier_${Date.now()}.xlsx`;
    const filePath = path.join(reportsDir, fileName);
    const workbook = new ExcelJS.Workbook();

    // Métadonnées
    workbook.creator = 'CENOU - Centre National des Œuvres Universitaires';
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.lastModifiedBy = 'Système CENOU';
    
    // ✅ Options strictes pour format Excel
    workbook.properties = {
      date1904: false,
    };
    workbook.calcProperties = {
      fullCalcOnLoad: true,
    };

    // ========== FEUILLE 1 : PAGE DE GARDE ==========
    const coverSheet = workbook.addWorksheet('Page de Garde', {
      pageSetup: { paperSize: 9, orientation: 'portrait' } // A4
    });

    // Configuration des colonnes
    coverSheet.columns = [
      { width: 15 }, { width: 15 }, { width: 15 }, 
      { width: 15 }, { width: 15 }, { width: 15 }
    ];

    // Ajouter l'en-tête officiel
    let startRow = await addOfficialHeaderExcel(coverSheet, workbook);
    startRow += 2;

    // Ligne de séparation
    coverSheet.mergeCells(`A${startRow}:F${startRow}`);
    coverSheet.getCell(`A${startRow}`).border = {
      bottom: { style: 'thick', color: { argb: 'FF2196F3' } }
    };
    startRow += 2;

    // Titre du rapport
    coverSheet.mergeCells(`A${startRow}:F${startRow}`);
    const title = coverSheet.getCell(`A${startRow}`);
    title.value = 'RAPPORT FINANCIER';
    title.font = { name: 'Arial', size: 18, bold: true, underline: true };
    title.alignment = { horizontal: 'center', vertical: 'middle' };
    coverSheet.getRow(startRow).height = 30;
    startRow += 3;

    // Sous-titre (période)
    if (options.periode) {
      coverSheet.mergeCells(`A${startRow}:F${startRow}`);
      const subtitle = coverSheet.getCell(`A${startRow}`);
      subtitle.value = `Période: ${options.periode}`;
      subtitle.font = { name: 'Arial', size: 12 };
      subtitle.alignment = { horizontal: 'center', vertical: 'middle' };
      startRow += 2;
    }

    // Informations générales
    coverSheet.mergeCells(`A${startRow}:F${startRow}`);
    const info1 = coverSheet.getCell(`A${startRow}`);
    info1.value = `Centre: ${options.centre || 'Tous les centres'}`;
    info1.font = { name: 'Arial', size: 10 };
    info1.alignment = { horizontal: 'center' };
    startRow++;

    coverSheet.mergeCells(`A${startRow}:F${startRow}`);
    const info2 = coverSheet.getCell(`A${startRow}`);
    const dateStr = new Date().toLocaleDateString('fr-FR', { 
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
    });
    info2.value = `Date de génération: ${dateStr}`;
    info2.font = { name: 'Arial', size: 10 };
    info2.alignment = { horizontal: 'center' };
    startRow += 3;

    // Encadré résumé financier
    const stats = data.statistiques || {};
    const summaryStartRow = startRow;

    // Bordure et fond du résumé
    for (let row = summaryStartRow; row < summaryStartRow + 8; row++) {
      for (let col = 1; col <= 6; col++) {
        const cell = coverSheet.getCell(row, col);
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE3F2FD' }
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF2196F3' } },
          left: { style: 'thin', color: { argb: 'FF2196F3' } },
          bottom: { style: 'thin', color: { argb: 'FF2196F3' } },
          right: { style: 'thin', color: { argb: 'FF2196F3' } }
        };
      }
    }

    // Titre du résumé
    coverSheet.mergeCells(`A${startRow}:F${startRow}`);
    const summaryTitle = coverSheet.getCell(`A${startRow}`);
    summaryTitle.value = 'RÉSUMÉ FINANCIER';
    summaryTitle.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    summaryTitle.alignment = { horizontal: 'center', vertical: 'middle' };
    summaryTitle.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2196F3' }
    };
    coverSheet.getRow(startRow).height = 25;
    startRow += 2;

    // ✅ Statistiques avec formatage montants corrigé
    const statsData = [
      { 
        label: 'Total paiements confirmés', 
        value: `${stats.total_paiements || 0} paiement${stats.total_paiements > 1 ? 's' : ''}`
      },
      { 
        label: 'Montant total collecté', 
        value: `${formatMontant(stats.montant_total || 0)} FCFA`, 
        highlight: true 
      },
      { 
        label: 'Paiements en attente', 
        value: `${stats.paiements_en_attente || 0} paiement${stats.paiements_en_attente > 1 ? 's' : ''}` 
      },
      { 
        label: 'Montant en attente', 
        value: `${formatMontant(stats.montant_en_attente || 0)} FCFA` 
      },
      { 
        label: 'Taux de recouvrement', 
        value: `${stats.taux_recouvrement || 0}%`, 
        highlight: true 
      },
    ];

    statsData.forEach((stat) => {
      coverSheet.mergeCells(`A${startRow}:C${startRow}`);
      const labelCell = coverSheet.getCell(`A${startRow}`);
      labelCell.value = stat.label + ':';
      labelCell.font = { name: 'Arial', size: 11 };
      labelCell.alignment = { horizontal: 'left', vertical: 'middle' };

      coverSheet.mergeCells(`D${startRow}:F${startRow}`);
      const valueCell = coverSheet.getCell(`D${startRow}`);
      valueCell.value = stat.value;
      valueCell.font = { 
        name: 'Arial', 
        size: 11, 
        bold: stat.highlight,
        color: stat.highlight ? { argb: 'FF2196F3' } : undefined
      };
      valueCell.alignment = { horizontal: 'right', vertical: 'middle' };

      startRow++;
    });

    // ========== FEUILLE 2 : DÉTAILS DES PAIEMENTS ==========
    const detailsSheet = workbook.addWorksheet('Détails Paiements', {
      pageSetup: { paperSize: 9, orientation: 'landscape' }
    });

    // En-têtes des colonnes
    detailsSheet.columns = [
      { header: 'MATRICULE', key: 'matricule', width: 15 },
      { header: 'NOM', key: 'nom', width: 20 },
      { header: 'PRÉNOM', key: 'prenom', width: 20 },
      { header: 'CENTRE', key: 'centre', width: 25 },
      { header: 'CHAMBRE', key: 'chambre', width: 12 },
      { header: 'MONTANT (FCFA)', key: 'montant', width: 18 },
      { header: 'DATE', key: 'date_paiement', width: 15 },
      { header: 'MODE', key: 'mode_paiement', width: 18 },
      { header: 'STATUT', key: 'statut', width: 15 },
    ];

    // Style de l'en-tête
    const headerRow = detailsSheet.getRow(1);
    headerRow.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2196F3' },
    };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
    headerRow.height = 25;

    // Bordures de l'en-tête
    headerRow.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    // ✅ Ajouter les données (TOUS les paiements de la période)
    if (data.paiements && data.paiements.length > 0) {
      data.paiements.forEach((paiement, index) => {
        const row = detailsSheet.addRow({
          matricule: paiement.matricule || '-',
          nom: paiement.nom || '-',
          prenom: paiement.prenom || '-',
          centre: paiement.centre_nom || '-',
          chambre: paiement.numero_chambre || '-',
          montant: parseFloat(paiement.montant) || 0,
          date_paiement: paiement.date_paiement 
            ? new Date(paiement.date_paiement).toLocaleDateString('fr-FR')
            : '-',
          mode_paiement: paiement.mode_paiement || '-',
          statut: paiement.statut || '-',
        });

        // Couleur alternée
        if (index % 2 === 0) {
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF5F5F5' }
          };
        }

        // ✅ Formater le montant avec séparateur d'espace
        row.getCell('montant').numFmt = '#,##0';
        row.getCell('montant').alignment = { horizontal: 'right' };

        // Couleur du statut
        const statutCell = row.getCell('statut');
        switch (paiement.statut) {
          case 'CONFIRME':
            statutCell.font = { color: { argb: 'FF4CAF50' }, bold: true };
            break;
          case 'EN_ATTENTE':
            statutCell.font = { color: { argb: 'FFFF9800' }, bold: true };
            break;
          case 'REJETE':
          case 'ECHEC':
            statutCell.font = { color: { argb: 'FFF44336' }, bold: true };
            break;
        }

        // Bordures
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
            left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
            bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
            right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
          };
        });
      });

      // ✅ Ligne de total
      const totalRow = detailsSheet.addRow({
        matricule: '',
        nom: '',
        prenom: '',
        centre: '',
        chambre: 'TOTAL',
        montant: { formula: `SUM(F2:F${data.paiements.length + 1})` },
        date_paiement: '',
        mode_paiement: '',
        statut: `${data.paiements.length} paiements`,
      });

      totalRow.font = { bold: true, size: 12 };
      totalRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFEB3B' }
      };
      totalRow.getCell('montant').numFmt = '#,##0';
      totalRow.getCell('chambre').alignment = { horizontal: 'right' };
      totalRow.eachCell((cell) => {
        cell.border = {
          top: { style: 'double', color: { argb: 'FF000000' } },
          left: { style: 'thin' },
          bottom: { style: 'double', color: { argb: 'FF000000' } },
          right: { style: 'thin' }
        };
      });
    } else {
      // Message si aucun paiement
      detailsSheet.mergeCells('A2:I2');
      const emptyCell = detailsSheet.getCell('A2');
      emptyCell.value = 'Aucun paiement trouvé pour cette période';
      emptyCell.font = { name: 'Arial', size: 12, italic: true, color: { argb: 'FF999999' } };
      emptyCell.alignment = { horizontal: 'center', vertical: 'middle' };
      detailsSheet.getRow(2).height = 40;
    }

    // Figer la première ligne
    detailsSheet.views = [{ state: 'frozen', ySplit: 1 }];

    // ========== FEUILLE 3 : ANALYSE GRAPHIQUE ==========
    const chartsSheet = workbook.addWorksheet('Analyse Graphique', {
      pageSetup: { paperSize: 9, orientation: 'portrait' }
    });

    let chartRow = 2;

    // Titre
    chartsSheet.mergeCells('A1:H1');
    const chartTitle = chartsSheet.getCell('A1');
    chartTitle.value = 'ANALYSE GRAPHIQUE';
    chartTitle.font = { name: 'Arial', size: 16, bold: true };
    chartTitle.alignment = { horizontal: 'center', vertical: 'middle' };
    chartsSheet.getRow(1).height = 30;
    chartRow += 2;

    // ✅ Données pour les graphiques - Par statut
    if (data.par_statut && data.par_statut.length > 0) {
      chartsSheet.mergeCells(`A${chartRow}:D${chartRow}`);
      const statutTitle = chartsSheet.getCell(`A${chartRow}`);
      statutTitle.value = 'Répartition par Statut';
      statutTitle.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF2196F3' } };
      chartRow += 2;

      // En-têtes du tableau
      chartsSheet.getCell(`A${chartRow}`).value = 'Statut';
      chartsSheet.getCell(`B${chartRow}`).value = 'Nombre';
      chartsSheet.getCell(`C${chartRow}`).value = 'Pourcentage';
      
      const headerRow2 = chartsSheet.getRow(chartRow);
      headerRow2.font = { bold: true };
      headerRow2.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE3F2FD' }
      };
      
      const dataStartRow = chartRow + 1;
      const totalStatuts = data.par_statut.reduce((sum, s) => sum + parseInt(s.nombre), 0);

      data.par_statut.forEach((stat, index) => {
        const nombre = parseInt(stat.nombre);
        const pourcentage = totalStatuts > 0 ? (nombre / totalStatuts) * 100 : 0;
        
        chartsSheet.getCell(`A${dataStartRow + index}`).value = stat.statut;
        chartsSheet.getCell(`B${dataStartRow + index}`).value = nombre;
        chartsSheet.getCell(`C${dataStartRow + index}`).value = pourcentage;
        chartsSheet.getCell(`C${dataStartRow + index}`).numFmt = '0.00"%"';
        
        // Couleur selon statut
        const row = chartsSheet.getRow(dataStartRow + index);
        switch (stat.statut) {
          case 'CONFIRME':
            row.getCell('A').font = { color: { argb: 'FF4CAF50' }, bold: true };
            break;
          case 'EN_ATTENTE':
            row.getCell('A').font = { color: { argb: 'FFFF9800' }, bold: true };
            break;
          case 'REJETE':
          case 'ECHEC':
            row.getCell('A').font = { color: { argb: 'FFF44336' }, bold: true };
            break;
        }
      });

      chartRow += data.par_statut.length + 4;
    }

    // ✅ Données pour les graphiques - Par mode de paiement
    if (data.par_mode_paiement && data.par_mode_paiement.length > 0) {
      chartsSheet.mergeCells(`A${chartRow}:D${chartRow}`);
      const modeTitle = chartsSheet.getCell(`A${chartRow}`);
      modeTitle.value = 'Répartition par Mode de Paiement';
      modeTitle.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF2196F3' } };
      chartRow += 2;

      // En-têtes du tableau
      chartsSheet.getCell(`A${chartRow}`).value = 'Mode';
      chartsSheet.getCell(`B${chartRow}`).value = 'Nombre';
      chartsSheet.getCell(`C${chartRow}`).value = 'Montant (FCFA)';
      
      const headerRow3 = chartsSheet.getRow(chartRow);
      headerRow3.font = { bold: true };
      headerRow3.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE3F2FD' }
      };
      
      const dataStartRow = chartRow + 1;

      data.par_mode_paiement.forEach((mode, index) => {
        chartsSheet.getCell(`A${dataStartRow + index}`).value = mode.mode_paiement;
        chartsSheet.getCell(`B${dataStartRow + index}`).value = parseInt(mode.nombre);
        chartsSheet.getCell(`C${dataStartRow + index}`).value = parseFloat(mode.montant_total);
        chartsSheet.getCell(`C${dataStartRow + index}`).numFmt = '#,##0';
      });
    }

    // ========== FEUILLE 4 : RÉPARTITION PAR MODE ==========
    if (data.par_mode_paiement && data.par_mode_paiement.length > 0) {
      const modeSheet = workbook.addWorksheet('Par Mode de Paiement');

      modeSheet.columns = [
        { header: 'MODE DE PAIEMENT', key: 'mode', width: 25 },
        { header: 'NOMBRE', key: 'nombre', width: 15 },
        { header: 'MONTANT TOTAL (FCFA)', key: 'montant', width: 25 },
        { header: 'POURCENTAGE', key: 'pourcentage', width: 18 },
      ];

      // Style de l'en-tête
      const modeHeaderRow = modeSheet.getRow(1);
      modeHeaderRow.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      modeHeaderRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFF9800' },
      };
      modeHeaderRow.alignment = { horizontal: 'center', vertical: 'middle' };
      modeHeaderRow.height = 25;

      // Calculer le total
      const totalMontantModes = data.par_mode_paiement.reduce(
        (sum, mode) => sum + parseFloat(mode.montant_total),
        0
      );

      // Ajouter les données
      data.par_mode_paiement.forEach((mode, index) => {
        const montant = parseFloat(mode.montant_total);
        const pourcentage = totalMontantModes > 0 ? (montant / totalMontantModes) * 100 : 0;

        const row = modeSheet.addRow({
          mode: mode.mode_paiement,
          nombre: parseInt(mode.nombre),
          montant: montant,
          pourcentage: pourcentage,
        });

        row.getCell('montant').numFmt = '#,##0';
        row.getCell('pourcentage').numFmt = '0.00"%"';

        // Couleur alternée
        if (index % 2 === 0) {
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFF3E0' }
          };
        }
      });

      // Ligne de total
      const totalRowMode = modeSheet.addRow({
        mode: 'TOTAL',
        nombre: { formula: `SUM(B2:B${data.par_mode_paiement.length + 1})` },
        montant: { formula: `SUM(C2:C${data.par_mode_paiement.length + 1})` },
        pourcentage: 100,
      });

      totalRowMode.font = { bold: true, size: 12 };
      totalRowMode.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFEB3B' }
      };
      totalRowMode.getCell('montant').numFmt = '#,##0';
      totalRowMode.getCell('pourcentage').numFmt = '0.00"%"';
    }

    // ========== FEUILLE 5 : ÉVOLUTION MENSUELLE ==========
    if (data.par_mois && data.par_mois.length > 0) {
      const moisSheet = workbook.addWorksheet('Évolution Mensuelle');

      moisSheet.columns = [
        { header: 'MOIS', key: 'mois', width: 20 },
        { header: 'NOMBRE PAIEMENTS', key: 'nombre', width: 20 },
        { header: 'MONTANT TOTAL (FCFA)', key: 'montant', width: 25 },
      ];

      // Style de l'en-tête
      const moisHeaderRow = moisSheet.getRow(1);
      moisHeaderRow.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      moisHeaderRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF9C27B0' },
      };
      moisHeaderRow.alignment = { horizontal: 'center', vertical: 'middle' };
      moisHeaderRow.height = 25;

      // Ajouter les données
      data.par_mois.forEach((mois, index) => {
        const row = moisSheet.addRow({
          mois: mois.mois,
          nombre: parseInt(mois.nombre),
          montant: parseFloat(mois.montant_total),
        });

        row.getCell('montant').numFmt = '#,##0';

        // Couleur alternée
        if (index % 2 === 0) {
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF3E5F5' }
          };
        }
      });
    }

    // ========== FEUILLE 6 : SIGNATURE ==========
    const signatureSheet = workbook.addWorksheet('Signature');

    signatureSheet.mergeCells('A20:F20');
    const directorLabel = signatureSheet.getCell('A20');
    directorLabel.value = 'Le directeur général';
    directorLabel.font = { name: 'Arial', size: 11 };
    directorLabel.alignment = { horizontal: 'right' };

    signatureSheet.mergeCells('A25:F25');
    const directorName = signatureSheet.getCell('A25');
    directorName.value = 'KABORE Séraphin';
    directorName.font = { name: 'Arial', size: 12, bold: true };
    directorName.alignment = { horizontal: 'right' };

    signatureSheet.mergeCells('A27:F27');
    const directorTitle = signatureSheet.getCell('A27');
    directorTitle.value = 'Chevalier de l\'Ordre des Palmes Académiques';
    directorTitle.font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF666666' } };
    directorTitle.alignment = { horizontal: 'right' };

    // ✅ Sauvegarder avec options strictes pour Excel
    await workbook.xlsx.writeFile(filePath, {
      useStyles: true,
      useSharedStrings: true,
    });

    console.log('✅ Rapport Excel professionnel généré:', fileName);
    console.log(`📊 Total paiements: ${data.paiements?.length || 0}`);
    console.log(`📄 Nombre de feuilles: ${workbook.worksheets.length}`);
    console.log(`💾 Taille fichier: ${(fs.statSync(filePath).size / 1024).toFixed(2)} KB`);
    
    return { fileName, filePath };

  } catch (error) {
    console.error('❌ Erreur génération Excel:', error);
    throw error;
  }
};

/**
 * Formater un montant en FCFA
 * ✅ Utilise séparateur d'espace
 */
function formatMontant(montant) {
  const value = Number(montant) || 0;
  
  return value
    .toFixed(0)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/**
 * Générer un rapport d'occupation en Excel professionnel
 */
const generateOccupationReportExcel = async (data, options = {}) => {
  try {
    const fileName = `rapport_occupation_${Date.now()}.xlsx`;
    const filePath = path.join(reportsDir, fileName);
    const workbook = new ExcelJS.Workbook();

    // Métadonnées
    workbook.creator = 'CENOU';
    workbook.created = new Date();

    // Feuille 1 : Page de garde
    const coverSheet = workbook.addWorksheet('Page de Garde');
    coverSheet.columns = Array(6).fill({ width: 15 });

    let startRow = await addOfficialHeaderExcel(coverSheet, workbook);
    startRow += 2;

    // Titre
    coverSheet.mergeCells(`A${startRow}:F${startRow}`);
    const title = coverSheet.getCell(`A${startRow}`);
    title.value = 'RAPPORT D\'OCCUPATION';
    title.font = { size: 18, bold: true };
    title.alignment = { horizontal: 'center' };
    startRow += 3;

    // Statistiques
    const stats = data.statistiques || {};
    const statsData = [
      { label: 'Total logements', value: stats.total_logements || 0 },
      { label: 'Occupés', value: stats.logements_occupes || 0 },
      { label: 'Disponibles', value: stats.logements_disponibles || 0 },
      { label: 'Taux occupation', value: `${stats.taux_occupation || 0}%` },
    ];

    statsData.forEach((stat) => {
      coverSheet.mergeCells(`A${startRow}:C${startRow}`);
      coverSheet.getCell(`A${startRow}`).value = stat.label;
      coverSheet.mergeCells(`D${startRow}:F${startRow}`);
      coverSheet.getCell(`D${startRow}`).value = stat.value;
      coverSheet.getCell(`D${startRow}`).alignment = { horizontal: 'right' };
      startRow++;
    });

    // Feuille 2 : Par type
    const typeSheet = workbook.addWorksheet('Par Type');
    typeSheet.columns = [
      { header: 'TYPE', key: 'type', width: 25 },
      { header: 'TOTAL', key: 'total', width: 15 },
      { header: 'OCCUPÉS', key: 'occupes', width: 15 },
      { header: 'DISPONIBLES', key: 'disponibles', width: 18 },
      { header: 'TAUX', key: 'taux', width: 15 },
    ];

    if (data.par_type_chambre) {
      data.par_type_chambre.forEach((type) => {
        typeSheet.addRow({
          type: type.type_chambre,
          total: type.total,
          occupes: type.occupes,
          disponibles: type.disponibles,
          taux: `${type.taux_occupation || 0}%`,
        });
      });
    }

    // Feuille 3 : Résidents
    const residentsSheet = workbook.addWorksheet('Résidents');
    residentsSheet.columns = [
      { header: 'MATRICULE', key: 'matricule', width: 15 },
      { header: 'NOM', key: 'nom', width: 20 },
      { header: 'PRÉNOM', key: 'prenom', width: 20 },
      { header: 'CHAMBRE', key: 'chambre', width: 12 },
      { header: 'TYPE', key: 'type', width: 20 },
    ];

    if (data.residents) {
      data.residents.forEach((r) => {
        residentsSheet.addRow({
          matricule: r.matricule,
          nom: r.nom,
          prenom: r.prenom,
          chambre: r.numero_chambre,
          type: r.type_chambre,
        });
      });
    }

    await workbook.xlsx.writeFile(filePath, {
      useStyles: true,
      useSharedStrings: true,
    });

    console.log('✅ Rapport occupation Excel généré:', fileName);
    return { fileName, filePath };
  } catch (error) {
    console.error('❌ Erreur Excel occupation:', error);
    throw error;
  }
};

module.exports = {
  generateFinancialReportExcel,
  generateOccupationReportExcel,
};