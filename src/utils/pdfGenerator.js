const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');

// Créer le dossier rapports s'il n'existe pas
const reportsDir = path.join(__dirname, '../../rapports');
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

// ✅ CHEMINS DES LOGOS
const LOGO_BURKINA = path.join(__dirname, '../assets/images/faso_drapeau.png');
const LOGO_CENOU = path.join(__dirname, '../assets/images/logo_cenou.png');

// ✅ Vérifier l'existence des logos au démarrage
console.log('🔍 Vérification des logos:');
console.log('  Logo Burkina:', fs.existsSync(LOGO_BURKINA) ? '✅ Trouvé' : '❌ Manquant');
console.log('  Logo CENOU:', fs.existsSync(LOGO_CENOU) ? '✅ Trouvé' : '❌ Manquant');

/**
 * Ajouter l'en-tête officiel du MESRSI
 */
function addOfficialHeader(doc) {
  const startY = 30;
  
  // Logo Burkina Faso (en haut à droite)
  try {
    if (fs.existsSync(LOGO_BURKINA)) {
      doc.image(LOGO_BURKINA, 480, startY, { width: 60 });
      console.log('✅ Logo Burkina inséré');
    } else {
      console.warn('⚠️ Logo Burkina non trouvé:', LOGO_BURKINA);
    }
  } catch (error) {
    console.error('❌ Erreur insertion logo Burkina:', error.message);
  }

  // Colonne gauche - Ministère (avec indentation intelligente)
  doc
    .fontSize(8)
    .font('Helvetica-Bold')
    .text('MINISTERE DE L\'ENSEIGNEMENT SUPERIEUR', 50, startY);
  
  doc
    .fontSize(8)
    .font('Helvetica')
    .text('     DE LA RECHERCHE SCIENTIFIQUE ET DE', 50, startY + 12)
    .text('           L\'INNOVATION (MESRSI)', 50, startY + 24);
  
  doc
    .fontSize(7)
    .text('             ***********************', 50, startY + 36);
  
  doc
    .fontSize(8)
    .font('Helvetica-Bold')
    .text('          SECRETARIAT GENERAL', 50, startY + 48);
  
  doc
    .fontSize(7)
    .font('Helvetica')
    .text('                *******************', 50, startY + 60);
  
  doc
    .fontSize(8)
    .text('DIRECTION GENERALE DE L\'ENSEIGNEMENT', 50, startY + 72)
    .text('                     SUPERIEUR', 50, startY + 84);
  
  doc
    .fontSize(7)
    .text('                  ********************', 50, startY + 96);
  
  doc
    .fontSize(8)
    .text('     DIRECTION DES INSTITUTIONS PRIVEES', 50, startY + 108)
    .text('            D\'ENSEIGNEMENT SUPERIEUR', 50, startY + 120);
  
  doc
    .fontSize(7)
    .text('                  ******************', 50, startY + 132);

  // Colonne droite - Burkina Faso avec devise
  doc
    .fontSize(9)
    .font('Helvetica-Bold')
    .text('Burkina Faso', 420, startY + 70, { align: 'right', width: 130 });
  
  doc
    .fontSize(7)
    .font('Helvetica')
    .text('*******************', 420, startY + 82, { align: 'right', width: 130 });
  
  // ✅ DEVISE DU BURKINA FASO
  doc
    .fontSize(7)
    .font('Helvetica-Oblique')
    .text('La Patrie ou la Mort', 420, startY + 94, { align: 'right', width: 130 });
  
  doc
    .fontSize(7)
    .text('nous Vaincrons', 420, startY + 106, { align: 'right', width: 130 });

  // Logo CENOU (centré)
  try {
    if (fs.existsSync(LOGO_CENOU)) {
      doc.image(LOGO_CENOU, 240, startY + 150, { width: 80 });
      console.log('✅ Logo CENOU inséré');
    } else {
      console.warn('⚠️ Logo CENOU non trouvé:', LOGO_CENOU);
    }
  } catch (error) {
    console.error('❌ Erreur insertion logo CENOU:', error.message);
  }

  // Nom du CENOU
  doc
    .fontSize(11)
    .font('Helvetica-Bold')
    .fillColor('#000')
    .text('Centre National des Œuvres Universitaires', 50, startY + 240, { 
      align: 'center',
      width: 500
    });

  return startY + 270;
}

// Réutilise l'instance ChartJSNodeCanvas par dimension : sa construction
// (canvas natif + enregistrement Chart.js) est coûteuse et n'a pas à être
// refaite à chaque graphique ni à chaque requête. Gros gain sur la génération.
const _chartCanvasCache = new Map();
function getChartCanvas(width, height) {
  const key = `${width}x${height}`;
  if (!_chartCanvasCache.has(key)) {
    _chartCanvasCache.set(key, new ChartJSNodeCanvas({ width, height }));
  }
  return _chartCanvasCache.get(key);
}

/**
 * Générer un graphique en camembert
 */
async function generatePieChart(data, width = 400, height = 300) {
  try {
    const chartJSNodeCanvas = getChartCanvas(width, height);
    
    const configuration = {
      type: 'pie',
      data: {
        labels: data.labels,
        datasets: [{
          data: data.values,
          backgroundColor: [
            '#4CAF50', // Vert - Confirmés
            '#FF9800', // Orange - En attente
            '#F44336', // Rouge - Rejetés
          ],
        }],
      },
      options: {
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              font: { size: 12 },
              padding: 15,
            },
          },
          title: {
            display: true,
            text: data.title,
            font: { size: 14, weight: 'bold' },
            padding: { bottom: 20 },
          },
        },
      },
    };

    const buffer = await chartJSNodeCanvas.renderToBuffer(configuration);
    console.log('✅ Graphique camembert généré');
    return buffer;
  } catch (error) {
    console.error('❌ Erreur génération graphique camembert:', error.message);
    return null;
  }
}

/**
 * Générer un graphique en barres
 */
async function generateBarChart(data, width = 500, height = 300) {
  try {
    const chartJSNodeCanvas = getChartCanvas(width, height);
    
    const configuration = {
      type: 'bar',
      data: {
        labels: data.labels,
        datasets: [{
          label: 'Montant (FCFA)',
          data: data.values,
          backgroundColor: '#2196F3',
        }],
      },
      options: {
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: data.title,
            font: { size: 14, weight: 'bold' },
            padding: { bottom: 20 },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (value) => formatMontant(value) + ' FCFA',
            },
          },
        },
      },
    };

    const buffer = await chartJSNodeCanvas.renderToBuffer(configuration);
    console.log('✅ Graphique barres généré');
    return buffer;
  } catch (error) {
    console.error('❌ Erreur génération graphique barres:', error.message);
    return null;
  }
}

/**
 * Ajouter pied de page avec numéro
 */
function addFooter(doc, pageNumber) {
  doc
    .fontSize(9)
    .font('Helvetica')
    .fillColor('#666')
    .text(`Page ${pageNumber}`, 50, 750, { align: 'right', width: 500 });

  doc
    .fontSize(8)
    .text(
      'Document généré automatiquement par le système CENOU',
      50,
      770,
      { align: 'center', width: 500 }
    );
}

/**
 * Générer un rapport financier en PDF professionnel
 * ✅ OPTIMISÉ POUR 1000+ PAIEMENTS (streaming, pas de bufferPages)
 */
const generateFinancialReportPDF = async (data, options = {}) => {
  return new Promise(async (resolve, reject) => {
    try {
      const fileName = `rapport_financier_${Date.now()}.pdf`;
      const filePath = path.join(reportsDir, fileName);

      // ✅ SANS bufferPages pour éviter le bug mémoire
      const doc = new PDFDocument({ 
        margin: 50,
        size: 'A4',
        // bufferPages: true,  ← SUPPRIMÉ pour éviter crash avec 300+ paiements
      });
      
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      let pageNumber = 1;

      // ========== PAGE 1 : EN-TÊTE + RÉSUMÉ ==========
      let currentY = addOfficialHeader(doc);

      // Ligne de séparation
      doc
        .moveTo(50, currentY)
        .lineTo(550, currentY)
        .stroke();
      
      currentY += 15;

      // Titre du rapport
      doc
        .fontSize(16)
        .font('Helvetica-Bold')
        .text('RAPPORT FINANCIER', 50, currentY, { align: 'center', underline: true });
      
      currentY += 25;

      // Sous-titre
      if (options.periode) {
        doc
          .fontSize(11)
          .font('Helvetica')
          .text(`Période: ${options.periode}`, 50, currentY, { align: 'center' });
        currentY += 15;
      }

      // Informations générales
      doc
        .fontSize(9)
        .text(`Centre: ${options.centre || 'Tous les centres'}`, 50, currentY)
        .text(`Date de génération: ${new Date().toLocaleDateString('fr-FR', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })}`, 50, currentY + 12);
      
      currentY += 40;

      // Encadré Résumé
      const stats = data.statistiques || {};
      
      doc
        .rect(50, currentY, 500, 150)
        .fillAndStroke('#E3F2FD', '#2196F3');

      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .fillColor('#000')
        .text('RÉSUMÉ FINANCIER', 60, currentY + 10);

      currentY += 35;

      // Statistiques principales
      const statsData = [
        { label: 'Total paiements confirmés', value: `${stats.total_paiements || 0} paiement${stats.total_paiements > 1 ? 's' : ''}` },
        { label: 'Montant total collecté', value: `${formatMontant(stats.montant_total || 0)} FCFA`, highlight: true },
        { label: 'Paiements en attente', value: `${stats.paiements_en_attente || 0} paiement${stats.paiements_en_attente > 1 ? 's' : ''}` },
        { label: 'Montant en attente', value: `${formatMontant(stats.montant_en_attente || 0)} FCFA` },
        { label: 'Taux de recouvrement', value: `${stats.taux_recouvrement || 0}%`, highlight: true },
      ];

      statsData.forEach((stat, index) => {
        const y = currentY + (index * 20);
        doc
          .fontSize(10)
          .font('Helvetica')
          .fillColor('#000')
          .text(stat.label + ':', 60, y, { width: 250 });

        doc
          .font(stat.highlight ? 'Helvetica-Bold' : 'Helvetica')
          .fillColor(stat.highlight ? '#2196F3' : '#000')
          .text(stat.value, 310, y, { width: 230, align: 'right' });
      });

      // ✅ Pied de page 1
      addFooter(doc, pageNumber);

      // ========== PAGE 2 : GRAPHIQUES ==========
      doc.addPage();
      pageNumber++;
      currentY = 50;

      doc
        .fontSize(14)
        .font('Helvetica-Bold')
        .fillColor('#000')
        .text('ANALYSE GRAPHIQUE', 50, currentY, { align: 'center' });
      
      currentY += 30;

      // ✅ Graphique camembert - Répartition par statut
      if (data.par_statut && data.par_statut.length > 0) {
        const pieChartData = {
          title: 'Répartition des paiements par statut',
          labels: data.par_statut.map(s => s.statut),
          values: data.par_statut.map(s => parseInt(s.nombre)),
        };

        const pieChart = await generatePieChart(pieChartData);
        if (pieChart) {
          doc.image(pieChart, 100, currentY, { width: 400 });
          currentY += 320;
        } else {
          console.warn('⚠️ Graphique camembert non généré');
        }
      } else {
        console.warn('⚠️ Données par_statut manquantes pour le camembert');
      }

      // Graphique barres - Montants par mode de paiement
      if (data.par_mode_paiement && data.par_mode_paiement.length > 0) {
        const barChartData = {
          title: 'Montants par mode de paiement',
          labels: data.par_mode_paiement.map(m => m.mode_paiement),
          values: data.par_mode_paiement.map(m => parseFloat(m.montant_total)),
        };

        const barChart = await generateBarChart(barChartData);
        if (barChart) {
          doc.image(barChart, 50, currentY, { width: 500 });
        }
      }

      // ✅ Pied de page 2
      addFooter(doc, pageNumber);

      // ========== PAGES SUIVANTES : TABLEAU DÉTAILLÉ ==========
      if (data.paiements && data.paiements.length > 0) {
        doc.addPage();
        pageNumber++;
        currentY = 50;

        doc
          .fontSize(14)
          .font('Helvetica-Bold')
          .fillColor('#000')
          .text('DÉTAIL DES PAIEMENTS', 50, currentY, { align: 'center' });
        
        currentY += 30;

        // En-têtes du tableau
        const tableTop = currentY;
        const colWidths = {
          matricule: 80,
          nom: 110,
          montant: 75,
          date: 70,
          mode: 90,
          statut: 65,
        };

        // Dessiner l'en-tête
        doc
          .rect(50, tableTop, 490, 25)
          .fillAndStroke('#2196F3', '#2196F3');

        doc
          .fontSize(9)
          .font('Helvetica-Bold')
          .fillColor('#FFF')
          .text('MATRICULE', 53, tableTop + 8, { width: colWidths.matricule })
          .text('NOM COMPLET', 133, tableTop + 8, { width: colWidths.nom })
          .text('MONTANT', 243, tableTop + 8, { width: colWidths.montant })
          .text('DATE', 318, tableTop + 8, { width: colWidths.date })
          .text('MODE', 388, tableTop + 8, { width: colWidths.mode })
          .text('STATUT', 478, tableTop + 8, { width: colWidths.statut });

        currentY = tableTop + 25;

        // Lignes de données
        doc.fontSize(8).font('Helvetica').fillColor('#000');

        data.paiements.forEach((paiement, index) => {
          // Nouvelle page si nécessaire
          if (currentY > 750) {
            // ✅ Pied de page avant nouvelle page
            addFooter(doc, pageNumber);

            doc.addPage();
            pageNumber++;
            currentY = 50;
            
            // Réafficher l'en-tête
            doc
              .rect(50, currentY, 490, 25)
              .fillAndStroke('#2196F3', '#2196F3');

            doc
              .fontSize(9)
              .font('Helvetica-Bold')
              .fillColor('#FFF')
              .text('MATRICULE', 53, currentY + 8, { width: colWidths.matricule })
              .text('NOM COMPLET', 133, currentY + 8, { width: colWidths.nom })
              .text('MONTANT', 243, currentY + 8, { width: colWidths.montant })
              .text('DATE', 318, currentY + 8, { width: colWidths.date })
              .text('MODE', 388, currentY + 8, { width: colWidths.mode })
              .text('STATUT', 478, currentY + 8, { width: colWidths.statut });

            currentY += 25;
            doc.fontSize(8).font('Helvetica').fillColor('#000');
          }

          // ✅ Couleur alternée (FIX: remettre fillColor après le fond)
          if (index % 2 === 0) {
            doc.rect(50, currentY, 490, 20).fillAndStroke('#F5F5F5', '#F5F5F5');
          }

          // ✅ CRITIQUE : Remettre la couleur et police APRÈS le fond
          doc.fillColor('#000').font('Helvetica').fontSize(8);

          // Données
          const nomComplet = `${paiement.nom || ''} ${paiement.prenom || ''}`.trim();
          const montant = formatMontant(paiement.montant) + ' FCFA';
          const date = paiement.date_paiement 
            ? new Date(paiement.date_paiement).toLocaleDateString('fr-FR')
            : '-';

          // ✅ Écrire toutes les cellules
          doc.text(paiement.matricule || '-', 53, currentY + 5, { width: colWidths.matricule, ellipsis: true });
          doc.text(nomComplet, 133, currentY + 5, { width: colWidths.nom, ellipsis: true });
          doc.text(montant, 243, currentY + 5, { width: colWidths.montant });
          doc.text(date, 318, currentY + 5, { width: colWidths.date });
          doc.text(paiement.mode_paiement || '-', 388, currentY + 5, { width: colWidths.mode, ellipsis: true });

          // Statut avec couleur (dernière cellule)
          const statutColor = getStatutColor(paiement.statut);
          doc
            .fillColor(statutColor)
            .font('Helvetica-Bold')
            .text(paiement.statut || '-', 478, currentY + 5, { width: colWidths.statut });

          // ✅ CRITIQUE : Remettre couleur/font par défaut IMMÉDIATEMENT
          doc.fillColor('#000').font('Helvetica');

          // ✅ Avancer à la ligne suivante
          currentY += 20;
        });

        // ✅ Pied de dernière page du tableau
        addFooter(doc, pageNumber);
      }

      // ========== DERNIÈRE PAGE : SIGNATURE ==========
      doc.addPage();
      pageNumber++;
      currentY = 600;

      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor('#000')
        .text('Le directeur général', 400, currentY);

      currentY += 60;

      doc
        .fontSize(11)
        .font('Helvetica-Bold')
        .text('KABORE Séraphin', 400, currentY);

      currentY += 15;

      doc
        .fontSize(9)
        .font('Helvetica-Oblique')
        .fillColor('#666')
        .text('Chevalier de l\'Ordre des Palmes Académiques', 350, currentY);

      // ✅ Pied de dernière page
      addFooter(doc, pageNumber);

      doc.end();

      stream.on('finish', () => {
        console.log('✅ Rapport PDF généré:', fileName);
        console.log(`📄 Total pages: ${pageNumber}`);
        console.log(`📊 Total paiements: ${data.paiements?.length || 0}`);
        resolve({ fileName, filePath });
      });

      stream.on('error', (error) => {
        console.error('❌ Erreur génération PDF:', error);
        reject(error);
      });

    } catch (error) {
      console.error('❌ Erreur génération PDF:', error);
      reject(error);
    }
  });
};

/**
 * Formater un montant en FCFA
 * ✅ FIX: Utilise regex au lieu de Intl pour éviter "3/000"
 */
function formatMontant(montant) {
  const value = Number(montant) || 0;
  
  return value
    .toFixed(0)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/**
 * Obtenir la couleur d'un statut
 */
function getStatutColor(statut) {
  switch (statut) {
    case 'CONFIRME':
      return '#4CAF50';
    case 'EN_ATTENTE':
      return '#FF9800';
    case 'REJETE':
      return '#F44336';
    default:
      return '#000';
  }
}

/**
 * Générer un rapport d'occupation en PDF professionnel
 */
const generateOccupationReportPDF = async (data, options = {}) => {
  return new Promise(async (resolve, reject) => {
    try {
      const fileName = `rapport_occupation_${Date.now()}.pdf`;
      const filePath = path.join(reportsDir, fileName);

      const doc = new PDFDocument({ 
        margin: 50,
        size: 'A4',
      });
      
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      let pageNumber = 1;

      // ========== PAGE 1 : EN-TÊTE + STATISTIQUES ==========
      let currentY = addOfficialHeader(doc);

      doc
        .moveTo(50, currentY)
        .lineTo(550, currentY)
        .stroke();
      
      currentY += 15;

      // Titre
      doc
        .fontSize(16)
        .font('Helvetica-Bold')
        .text('RAPPORT D\'OCCUPATION', 50, currentY, { align: 'center', underline: true });
      
      currentY += 25;

      // Informations
      doc
        .fontSize(9)
        .font('Helvetica')
        .text(`Centre: ${options.centre || 'Tous les centres'}`, 50, currentY)
        .text(`Date de génération: ${new Date().toLocaleDateString('fr-FR', { 
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
        })}`, 50, currentY + 12);
      
      currentY += 40;

      // Statistiques globales
      const stats = data.statistiques || {};
      
      doc
        .rect(50, currentY, 500, 120)
        .fillAndStroke('#E3F2FD', '#2196F3');

      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .fillColor('#000')
        .text('STATISTIQUES GLOBALES', 60, currentY + 10);

      currentY += 35;

      const statsData = [
        { label: 'Total logements', value: `${stats.total_logements || 0}` },
        { label: 'Logements occupés', value: `${stats.logements_occupes || 0}`, highlight: true },
        { label: 'Logements disponibles', value: `${stats.logements_disponibles || 0}` },
        { label: 'Taux d\'occupation', value: `${stats.taux_occupation || 0}%`, highlight: true },
        { label: 'Total résidents', value: `${stats.total_residents || 0}` },
      ];

      statsData.forEach((stat, index) => {
        const y = currentY + (index * 15);
        doc
          .fontSize(10)
          .font('Helvetica')
          .fillColor('#000')
          .text(stat.label + ':', 60, y, { width: 250 });

        doc
          .font(stat.highlight ? 'Helvetica-Bold' : 'Helvetica')
          .fillColor(stat.highlight ? '#2196F3' : '#000')
          .text(stat.value, 310, y, { width: 230, align: 'right' });
      });

      addFooter(doc, pageNumber);

      // ========== PAGE 2 : RÉPARTITION PAR TYPE ==========
      doc.addPage();
      pageNumber++;
      currentY = 50;

      doc
        .fontSize(14)
        .font('Helvetica-Bold')
        .fillColor('#000')
        .text('RÉPARTITION PAR TYPE DE CHAMBRE', 50, currentY, { align: 'center' });
      
      currentY += 30;

      if (data.par_type_chambre && data.par_type_chambre.length > 0) {
        // En-têtes tableau
        const tableTop = currentY;
        
        doc
          .rect(50, tableTop, 490, 25)
          .fillAndStroke('#2196F3', '#2196F3');

        doc
          .fontSize(9)
          .font('Helvetica-Bold')
          .fillColor('#FFF')
          .text('TYPE', 53, tableTop + 8, { width: 120 })
          .text('TOTAL', 173, tableTop + 8, { width: 70, align: 'center' })
          .text('OCCUPÉS', 243, tableTop + 8, { width: 80, align: 'center' })
          .text('DISPONIBLES', 323, tableTop + 8, { width: 90, align: 'center' })
          .text('TAUX', 413, tableTop + 8, { width: 120, align: 'center' });

        currentY = tableTop + 25;

        doc.fontSize(8).font('Helvetica').fillColor('#000');

        data.par_type_chambre.forEach((type, index) => {
          if (currentY > 750) {
            addFooter(doc, pageNumber);
            doc.addPage();
            pageNumber++;
            currentY = 50;
          }

          if (index % 2 === 0) {
            doc.rect(50, currentY, 490, 20).fillAndStroke('#F5F5F5', '#F5F5F5');
          }

          doc.fillColor('#000').font('Helvetica').fontSize(8);

          doc.text(type.type_chambre || '-', 53, currentY + 5, { width: 120 });
          doc.text(type.total || '0', 173, currentY + 5, { width: 70, align: 'center' });
          doc.text(type.occupes || '0', 243, currentY + 5, { width: 80, align: 'center' });
          doc.text(type.disponibles || '0', 323, currentY + 5, { width: 90, align: 'center' });
          doc.text(`${type.taux_occupation || 0}%`, 413, currentY + 5, { width: 120, align: 'center' });

          currentY += 20;
        });
      }

      addFooter(doc, pageNumber);

      // ========== PAGE 3 : LISTE DES RÉSIDENTS ==========
      if (data.residents && data.residents.length > 0) {
        doc.addPage();
        pageNumber++;
        currentY = 50;

        doc
          .fontSize(14)
          .font('Helvetica-Bold')
          .fillColor('#000')
          .text('LISTE DES RÉSIDENTS ACTIFS', 50, currentY, { align: 'center' });
        
        currentY += 30;

        // En-têtes
        const tableTop = currentY;
        
        doc
          .rect(50, tableTop, 490, 25)
          .fillAndStroke('#2196F3', '#2196F3');

        doc
          .fontSize(9)
          .font('Helvetica-Bold')
          .fillColor('#FFF')
          .text('MATRICULE', 53, tableTop + 8, { width: 80 })
          .text('NOM COMPLET', 133, tableTop + 8, { width: 130 })
          .text('CHAMBRE', 263, tableTop + 8, { width: 70 })
          .text('TYPE', 333, tableTop + 8, { width: 80 })
          .text('DATE DÉBUT', 413, tableTop + 8, { width: 120 });

        currentY = tableTop + 25;

        doc.fontSize(8).font('Helvetica').fillColor('#000');

        data.residents.forEach((resident, index) => {
          if (currentY > 750) {
            addFooter(doc, pageNumber);
            doc.addPage();
            pageNumber++;
            currentY = 50;
            
            // Réafficher l'en-tête
            doc
              .rect(50, currentY, 490, 25)
              .fillAndStroke('#2196F3', '#2196F3');

            doc
              .fontSize(9)
              .font('Helvetica-Bold')
              .fillColor('#FFF')
              .text('MATRICULE', 53, currentY + 8, { width: 80 })
              .text('NOM COMPLET', 133, currentY + 8, { width: 130 })
              .text('CHAMBRE', 263, currentY + 8, { width: 70 })
              .text('TYPE', 333, currentY + 8, { width: 80 })
              .text('DATE DÉBUT', 413, currentY + 8, { width: 120 });

            currentY += 25;
            doc.fontSize(8).font('Helvetica').fillColor('#000');
          }

          if (index % 2 === 0) {
            doc.rect(50, currentY, 490, 20).fillAndStroke('#F5F5F5', '#F5F5F5');
          }

          doc.fillColor('#000').font('Helvetica').fontSize(8);

          const nomComplet = `${resident.nom || ''} ${resident.prenom || ''}`.trim();
          const dateDebut = resident.date_debut 
            ? new Date(resident.date_debut).toLocaleDateString('fr-FR')
            : '-';

          doc.text(resident.matricule || '-', 53, currentY + 5, { width: 80, ellipsis: true });
          doc.text(nomComplet, 133, currentY + 5, { width: 130, ellipsis: true });
          doc.text(resident.numero_chambre || '-', 263, currentY + 5, { width: 70 });
          doc.text(resident.type_chambre || '-', 333, currentY + 5, { width: 80, ellipsis: true });
          doc.text(dateDebut, 413, currentY + 5, { width: 120 });

          currentY += 20;
        });

        addFooter(doc, pageNumber);
      }

      // ========== DERNIÈRE PAGE : SIGNATURE ==========
      doc.addPage();
      pageNumber++;
      currentY = 600;

      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor('#000')
        .text('Le directeur général', 400, currentY);

      currentY += 60;

      doc
        .fontSize(11)
        .font('Helvetica-Bold')
        .text('KABORE Séraphin', 400, currentY);

      currentY += 15;

      doc
        .fontSize(9)
        .font('Helvetica-Oblique')
        .fillColor('#666')
        .text('Chevalier de l\'Ordre des Palmes Académiques', 350, currentY);

      addFooter(doc, pageNumber);

      doc.end();

      stream.on('finish', () => {
        console.log('✅ Rapport occupation PDF généré:', fileName);
        console.log(`📄 Total pages: ${pageNumber}`);
        console.log(`📊 Total résidents: ${data.residents?.length || 0}`);
        resolve({ fileName, filePath });
      });

      stream.on('error', (error) => {
        console.error('❌ Erreur génération PDF occupation:', error);
        reject(error);
      });

    } catch (error) {
      console.error('❌ Erreur génération PDF occupation:', error);
      reject(error);
    }
  });
};

// Pré-chauffage au démarrage : rend un graphique factice une fois pour que le
// tout premier rapport ne paie pas l'initialisation du canvas natif Chart.js.
// Ignoré en test (NODE_ENV=test) ; échec silencieux (non bloquant).
if (process.env.NODE_ENV !== 'test') {
  (async () => {
    try {
      const dummy = { labels: ['-'], values: [1], title: '' };
      await generatePieChart(dummy, 400, 300);
      await generateBarChart(dummy, 500, 300);
      console.log('✅ Générateur de graphiques pré-chauffé');
    } catch (e) {
      console.warn('⚠️ Pré-chauffage graphiques ignoré:', e.message);
    }
  })();
}

module.exports = {
  generateFinancialReportPDF,
  generateOccupationReportPDF,
  reportsDir,
};