const db = require('../config/database');
const { generateFinancialReportPDF, generateOccupationReportPDF } = require('../utils/pdfGenerator');
const { generateFinancialReportExcel, generateOccupationReportExcel } = require('../utils/excelGenerator');

/**
 * Générer un rapport financier
 * POST /api/rapports/financier
 */
const genererRapportFinancier = async (req, res) => {
    try {
        const { format, periode, centre_id, date_debut, date_fin } = req.body;

        // Construire la requête SQL avec filtres
        let whereConditions = ['p.statut = $1'];
        let params = ['CONFIRME'];
        let paramIndex = 2;

        // Filtre par centre
        if (centre_id) {
            whereConditions.push(`c.id = $${paramIndex}`);
            params.push(centre_id);
            paramIndex++;
        }

        // Filtre par période
        if (date_debut && date_fin) {
            whereConditions.push(`p.date_paiement BETWEEN $${paramIndex} AND $${paramIndex + 1}`);
            params.push(date_debut, date_fin);
            paramIndex += 2;
        } else if (periode === 'mois_en_cours') {
            whereConditions.push('EXTRACT(MONTH FROM p.date_paiement) = EXTRACT(MONTH FROM CURRENT_DATE)');
            whereConditions.push('EXTRACT(YEAR FROM p.date_paiement) = EXTRACT(YEAR FROM CURRENT_DATE)');
        } else if (periode === 'mois_dernier') {
            whereConditions.push('EXTRACT(MONTH FROM p.date_paiement) = EXTRACT(MONTH FROM CURRENT_DATE - INTERVAL \'1 month\')');
            whereConditions.push('EXTRACT(YEAR FROM p.date_paiement) = EXTRACT(YEAR FROM CURRENT_DATE - INTERVAL \'1 month\')');
        }

        const whereClause = whereConditions.join(' AND ');

        // ✅ Récupérer les statistiques globales (AVEC CONVERSION)
        const statsResult = await db.query(
            `SELECT 
                COUNT(*) as total_paiements, 
                COALESCE(SUM(p.montant::numeric), 0) as montant_total 
             FROM paiements p
             JOIN attributions a ON p.attribution_id = a.id
             JOIN logements l ON a.logement_id = l.id
             JOIN centres c ON l.centre_id = c.id
             WHERE ${whereClause}`,
            params
        );

        // ✅ Récupérer les paiements en attente (AVEC CONVERSION)
        // Construire les conditions pour les paiements en attente
        let enAttenteConditions = ['p.statut = $1'];
        let enAttenteParams = ['EN_ATTENTE'];
        let enAttenteIndex = 2;

        if (centre_id) {
            enAttenteConditions.push(`c.id = $${enAttenteIndex}`);
            enAttenteParams.push(centre_id);
            enAttenteIndex++;
        }

        // ✅ AJOUTER LE FILTRE DE DATE
        if (date_debut && date_fin) {
            enAttenteConditions.push(`p.date_paiement BETWEEN $${enAttenteIndex} AND $${enAttenteIndex + 1}`);
            enAttenteParams.push(date_debut, date_fin);
            enAttenteIndex += 2;
        } else if (periode === 'mois_en_cours') {
            enAttenteConditions.push('EXTRACT(MONTH FROM p.date_paiement) = EXTRACT(MONTH FROM CURRENT_DATE)');
            enAttenteConditions.push('EXTRACT(YEAR FROM p.date_paiement) = EXTRACT(YEAR FROM CURRENT_DATE)');
        } else if (periode === 'mois_dernier') {
            enAttenteConditions.push('EXTRACT(MONTH FROM p.date_paiement) = EXTRACT(MONTH FROM CURRENT_DATE - INTERVAL \'1 month\')');
            enAttenteConditions.push('EXTRACT(YEAR FROM p.date_paiement) = EXTRACT(YEAR FROM CURRENT_DATE - INTERVAL \'1 month\')');
        }

        const enAttenteWhere = enAttenteConditions.join(' AND ');

        const enAttenteResult = await db.query(
            `SELECT 
                COUNT(*) as paiements_en_attente, 
                COALESCE(SUM(p.montant::numeric), 0) as montant_en_attente 
             FROM paiements p
             JOIN attributions a ON p.attribution_id = a.id
             JOIN logements l ON a.logement_id = l.id
             JOIN centres c ON l.centre_id = c.id
             WHERE ${enAttenteWhere}`,
            enAttenteParams
        );

        // Construire les conditions pour les impayés
        let impayesConditions = ['p.statut = $1', 'p.date_echeance < CURRENT_DATE'];
        let impayesParams = ['EN_ATTENTE'];
        let impayesIndex = 2;

        if (centre_id) {
            impayesConditions.push(`c.id = $${impayesIndex}`);
            impayesParams.push(centre_id);
            impayesIndex++;
        }

        // ✅ AJOUTER LE FILTRE DE DATE
        if (date_debut && date_fin) {
            impayesConditions.push(`p.date_paiement BETWEEN $${impayesIndex} AND $${impayesIndex + 1}`);
            impayesParams.push(date_debut, date_fin);
            impayesIndex += 2;
        } else if (periode === 'mois_en_cours') {
            impayesConditions.push('EXTRACT(MONTH FROM p.date_paiement) = EXTRACT(MONTH FROM CURRENT_DATE)');
            impayesConditions.push('EXTRACT(YEAR FROM p.date_paiement) = EXTRACT(YEAR FROM CURRENT_DATE)');
        } else if (periode === 'mois_dernier') {
            impayesConditions.push('EXTRACT(MONTH FROM p.date_paiement) = EXTRACT(MONTH FROM CURRENT_DATE - INTERVAL \'1 month\')');
            impayesConditions.push('EXTRACT(YEAR FROM p.date_paiement) = EXTRACT(YEAR FROM CURRENT_DATE - INTERVAL \'1 month\')');
        }

        const impayesWhere = impayesConditions.join(' AND ');

        // Récupérer les impayés
        const impayesResult = await db.query(
            `SELECT COUNT(*) as impayés
             FROM paiements p
             JOIN attributions a ON p.attribution_id = a.id
             JOIN logements l ON a.logement_id = l.id
             JOIN centres c ON l.centre_id = c.id
             WHERE ${impayesWhere}`,
            impayesParams
        );

        // Calculer le taux de recouvrement
        const montantTotal = Number(statsResult.rows[0].montant_total || 0);
        const montantAttente = Number(enAttenteResult.rows[0].montant_en_attente || 0);

        const totalAttendus = montantTotal + montantAttente;

        const tauxRecouvrement =
        totalAttendus === 0
            ? 0
            : Number(((montantTotal * 100) / totalAttendus).toFixed(2));

        const statistiques = {
            total_paiements: Number(statsResult.rows[0].total_paiements),

            montant_total: Number(statsResult.rows[0].montant_total),
            paiements_en_attente: Number(enAttenteResult.rows[0].paiements_en_attente),

            montant_en_attente: Number(enAttenteResult.rows[0].montant_en_attente),
            impayés: Number(impayesResult.rows[0].impayés),

            taux_recouvrement: tauxRecouvrement,
        };

        // ✅ Répartition par mode de paiement (AVEC CONVERSION)
        const parModeResult = await db.query(
            `SELECT 
                p.mode_paiement, 
                COUNT(*) as nombre, 
                COALESCE(SUM(p.montant::numeric), 0) as montant_total 
             FROM paiements p
             JOIN attributions a ON p.attribution_id = a.id
             JOIN logements l ON a.logement_id = l.id
             JOIN centres c ON l.centre_id = c.id
             WHERE ${whereClause}
             GROUP BY p.mode_paiement
             ORDER BY montant_total DESC`,
            params
        );

        // ✅ CORRECTION 1 : Répartition par statut (CAMEMBERT) avec filtres de période
        let parStatutConditions = [];
        let parStatutParams = [];
        let parStatutIndex = 1;

        if (centre_id) {
            parStatutConditions.push(`c.id = $${parStatutIndex}`);
            parStatutParams.push(centre_id);
            parStatutIndex++;
        }

        // ✅ APPLIQUER LES FILTRES DE PÉRIODE
        if (date_debut && date_fin) {
            parStatutConditions.push(`p.date_paiement BETWEEN $${parStatutIndex} AND $${parStatutIndex + 1}`);
            parStatutParams.push(date_debut, date_fin);
            parStatutIndex += 2;
        } else if (periode === 'mois_en_cours') {
            parStatutConditions.push('EXTRACT(MONTH FROM p.date_paiement) = EXTRACT(MONTH FROM CURRENT_DATE)');
            parStatutConditions.push('EXTRACT(YEAR FROM p.date_paiement) = EXTRACT(YEAR FROM CURRENT_DATE)');
        } else if (periode === 'mois_dernier') {
            parStatutConditions.push('EXTRACT(MONTH FROM p.date_paiement) = EXTRACT(MONTH FROM CURRENT_DATE - INTERVAL \'1 month\')');
            parStatutConditions.push('EXTRACT(YEAR FROM p.date_paiement) = EXTRACT(YEAR FROM CURRENT_DATE - INTERVAL \'1 month\')');
        }

        const parStatutWhere = parStatutConditions.length > 0 ? parStatutConditions.join(' AND ') : '1=1';

        const parStatutResult = await db.query(
            `SELECT 
                p.statut, 
                COUNT(*) as nombre
             FROM paiements p
             JOIN attributions a ON p.attribution_id = a.id
             JOIN logements l ON a.logement_id = l.id
             JOIN centres c ON l.centre_id = c.id
             WHERE ${parStatutWhere}
             GROUP BY p.statut
             ORDER BY nombre DESC`,
            parStatutParams
        );

        // Évolution mensuelle (3 derniers mois)
        const parMoisResult = await db.query(
            `SELECT 
                TO_CHAR(p.date_paiement, 'YYYY-MM') as mois, 
                COUNT(*) as nombre, 
                COALESCE(SUM(p.montant::numeric), 0) as montant_total 
             FROM paiements p
             JOIN attributions a ON p.attribution_id = a.id
             JOIN logements l ON a.logement_id = l.id
             JOIN centres c ON l.centre_id = c.id
             WHERE p.statut = 'CONFIRME' AND p.date_paiement >= CURRENT_DATE - INTERVAL '3 months' ${centre_id ? 'AND c.id = $1' : ''}
             GROUP BY TO_CHAR(p.date_paiement, 'YYYY-MM')
             ORDER BY mois DESC`,
            centre_id ? [centre_id] : []
        );

        // ✅ CORRECTION 2 : Détails des paiements (TOUS les statuts de la période)
        let detailsConditions = [];
        let detailsParams = [];
        let detailsIndex = 1;

        if (centre_id) {
            detailsConditions.push(`c.id = $${detailsIndex}`);
            detailsParams.push(centre_id);
            detailsIndex++;
        }

        if (date_debut && date_fin) {
            detailsConditions.push(`p.date_paiement BETWEEN $${detailsIndex} AND $${detailsIndex + 1}`);
            detailsParams.push(date_debut, date_fin);
            detailsIndex += 2;
        } else if (periode === 'mois_en_cours') {
            detailsConditions.push('EXTRACT(MONTH FROM p.date_paiement) = EXTRACT(MONTH FROM CURRENT_DATE)');
            detailsConditions.push('EXTRACT(YEAR FROM p.date_paiement) = EXTRACT(YEAR FROM CURRENT_DATE)');
        } else if (periode === 'mois_dernier') {
            detailsConditions.push('EXTRACT(MONTH FROM p.date_paiement) = EXTRACT(MONTH FROM CURRENT_DATE - INTERVAL \'1 month\')');
            detailsConditions.push('EXTRACT(YEAR FROM p.date_paiement) = EXTRACT(YEAR FROM CURRENT_DATE - INTERVAL \'1 month\')');
        }

        const detailsWhere = detailsConditions.length > 0 ? detailsConditions.join(' AND ') : '1=1';

        const paiementsResult = await db.query(
            `SELECT 
                p.id, 
                u.matricule, 
                u.nom, 
                u.prenom, 
                l.numero_chambre,
                c.nom as centre_nom,
                p.montant::numeric as montant, 
                p.mode_paiement, 
                p.date_paiement, 
                p.statut
             FROM paiements p
             JOIN attributions a ON p.attribution_id = a.id
             JOIN logements l ON a.logement_id = l.id
             JOIN centres c ON l.centre_id = c.id
             JOIN utilisateurs u ON a.utilisateur_id = u.id
             WHERE ${detailsWhere}
             ORDER BY p.date_paiement DESC
             LIMIT 1000`,
            detailsParams
        );

        // ✅ AJOUTER par_statut dans reportData
        const reportData = {
            statistiques,
            par_mode_paiement: parModeResult.rows,
            par_statut: parStatutResult.rows,
            par_mois: parMoisResult.rows,
            paiements: paiementsResult.rows,
        };

        const options = {
            periode: periode || 'Personnalisée',
            centre: centre_id ? (await db.query('SELECT nom FROM centres WHERE id = $1', [centre_id])).rows[0]?.nom : 'Tous les centres',
        };

        // Générer le rapport selon le format demandé
        let result;
        if (format === 'pdf') {
            result = await generateFinancialReportPDF(reportData, options);
        } else if (format === 'excel') {
            result = await generateFinancialReportExcel(reportData, options);
        } else {
            return res.status(400).json({
                error: 'Format invalide',
                formats_acceptes: ['pdf', 'excel'],
            });
        }

        // ✅ FIX TÉLÉCHARGEMENT : Définir les headers HTTP selon le format
        let contentType;
        if (format === 'pdf') {
            contentType = 'application/pdf';
        } else if (format === 'excel') {
            contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        } else {
            contentType = 'application/octet-stream';
        }

        // ✅ Configurer les headers HTTP
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        console.log(`📤 Envoi fichier: ${result.fileName} (${contentType})`);

        // Envoyer le fichier en réponse
        res.download(result.filePath, result.fileName, (err) => {
            if (err) {
                console.error('❌ Erreur téléchargement fichier:', err);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Erreur lors du téléchargement du fichier' });
                }
            } else {
                console.log(`✅ Fichier téléchargé avec succès: ${result.fileName}`);
            }
        });

    } catch (error) {
        console.error('Erreur génération rapport financier:', error);
        res.status(500).json({
            error: 'Erreur lors de la génération du rapport financier',
            details: error.message,
        });
    }
};

/**
 * Générer un rapport d'occupation
 * POST /api/rapports/occupation
 */
const genererRapportOccupation = async (req, res) => {
    try {
        const { format, centre_id } = req.body;

        // Statistiques globales
        const statsResult = await db.query(
            `SELECT 
                COUNT(l.id) as total_logements,
                COUNT(CASE WHEN l.statut = 'OCCUPE' THEN 1 END) as logements_occupes,
                COUNT(CASE WHEN l.statut = 'DISPONIBLE' THEN 1 END) as logements_disponibles,
                COUNT(DISTINCT a.utilisateur_id) as total_residents
             FROM logements l
             LEFT JOIN attributions a ON l.id = a.logement_id AND a.statut = 'ACTIVE'
             LEFT JOIN centres c ON l.centre_id = c.id
             WHERE 1=1 ${centre_id ? 'AND c.id = $1' : ''}`,
            centre_id ? [centre_id] : []
        );

        const stats = statsResult.rows[0];
        const tauxOccupation = stats.total_logements > 0
            ? ((stats.logements_occupes / stats.total_logements) * 100).toFixed(2)
            : 0;

        const statistiques = { ...stats, taux_occupation: tauxOccupation };

        // Répartition par type de chambre
        const parTypeResult = await db.query(
            `SELECT 
                l.type_chambre,
                COUNT(l.id) as total,
                COUNT(CASE WHEN l.statut = 'OCCUPE' THEN 1 END) as occupes,
                COUNT(CASE WHEN l.statut = 'DISPONIBLE' THEN 1 END) as disponibles,
                ROUND((COUNT(CASE WHEN l.statut = 'OCCUPE' THEN 1 END)::numeric / COUNT(l.id)::numeric) * 100, 2) as taux_occupation
             FROM logements l
             LEFT JOIN centres c ON l.centre_id = c.id
             WHERE 1=1 ${centre_id ? 'AND c.id = $1' : ''}
             GROUP BY l.type_chambre
             ORDER BY l.type_chambre`,
            centre_id ? [centre_id] : []
        );

        // Liste des résidents actifs
        const residentsResult = await db.query(
            `SELECT 
                u.matricule, u.nom, u.prenom, l.numero_chambre, l.type_chambre,
                a.date_debut, a.date_fin
             FROM utilisateurs u
             JOIN attributions a ON u.id = a.utilisateur_id
             JOIN logements l ON a.logement_id = l.id
             JOIN centres c ON l.centre_id = c.id
             WHERE a.statut = 'ACTIVE' ${centre_id ? 'AND c.id = $1' : ''}
             ORDER BY u.nom, u.prenom
             LIMIT 1000`,
            centre_id ? [centre_id] : []
        );

        const reportData = {
            statistiques,
            par_type_chambre: parTypeResult.rows,
            residents: residentsResult.rows,
        };

        const options = {
            centre: centre_id ?
                (await db.query('SELECT nom FROM centres WHERE id = $1', [centre_id])).rows[0]?.nom : 'Tous les centres',
        };

        // Générer le rapport
        let result;
        if (format === 'pdf') {
            result = await generateOccupationReportPDF(reportData, options);
        } else if (format === 'excel') {
            result = await generateOccupationReportExcel(reportData, options);
        } else {
            return res.status(400).json({ error: 'Format invalide', formats_acceptes: ['pdf', 'excel'], });
        }

        // ✅ FIX TÉLÉCHARGEMENT : Définir les headers HTTP selon le format
        let contentType;
        if (format === 'pdf') {
            contentType = 'application/pdf';
        } else if (format === 'excel') {
            contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        } else {
            contentType = 'application/octet-stream';
        }

        // ✅ Configurer les headers HTTP
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        console.log(`📤 Envoi fichier: ${result.fileName} (${contentType})`);

        // Télécharger le fichier
        res.download(result.filePath, result.fileName, (err) => {
            if (err) {
                console.error('❌ Erreur téléchargement fichier:', err);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Erreur lors du téléchargement du fichier' });
                }
            } else {
                console.log(`✅ Fichier téléchargé avec succès: ${result.fileName}`);
            }
        });

    } catch (error) {
        console.error('Erreur génération rapport occupation:', error);
        res.status(500).json({
            error: 'Erreur lors de la génération du rapport d\'occupation',
            details: error.message,
        });
    }
};

module.exports = {
    genererRapportFinancier,
    genererRapportOccupation,
};