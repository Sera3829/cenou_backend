const db = require('../config/database');
const { db: firebaseDb, isFirebaseAvailable } = require('../config/firebase');
const axios = require('axios');
const crypto = require('crypto');

/**
 * Récupérer l'historique des paiements de l'utilisateur connecté
 * GET /api/paiements
 */
const getPaiements = async (req, res) => {
  try {
    const userId = req.user.id;

    // Récupérer les paiements de l'utilisateur
    const result = await db.query(
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
      [userId]
    );

    res.json({
      paiements: result.rows,
      total: result.rows.length,
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des paiements:', error);
    res.status(500).json({
      error: 'Erreur lors de la récupération des paiements',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined,
    });
  }
};

/**
 * Récupérer les détails d'un paiement spécifique
 * GET /api/paiements/:id
 */
const getPaiementById = async (req, res) => {
  try {
    const userId = req.user.id;
    const paiementId = req.params.id;

    // Récupérer le paiement avec vérification que l'utilisateur est bien le propriétaire
    const result = await db.query(
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
      [paiementId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Paiement introuvable ou accès non autorisé',
      });
    }

    res.json({
      paiement: result.rows[0],
    });
  } catch (error) {
    console.error('Erreur lors de la récupération du paiement:', error);
    res.status(500).json({
      error: 'Erreur lors de la récupération du paiement',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined,
    });
  }
};

/**
 * Récupérer les paiements en attente de l'utilisateur
 * GET /api/paiements/pending
 */
const getPendingPaiements = async (req, res) => {
  try {
    const userId = req.user.id;

    // Récupérer les paiements en attente ou impayés
    const result = await db.query(
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
      [userId]
    );

    res.json({
      paiements_en_attente: result.rows,
      total: result.rows.length,
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des paiements en attente:', error);
    res.status(500).json({
      error: 'Erreur lors de la récupération des paiements en attente',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined,
    });
  }
};

/**
 * Initier un paiement (Orange Money ou Moov Money)
 * POST /api/paiements/initier
 */
const initierPaiement = async (req, res) => {
  const client = await db.getClient();

  try {
    const userId = req.user.id;
    const { montant, mode_paiement, numero_telephone, nombre_mois } = req.body;

    // Validation du mode de paiement
    if (!['ORANGE_MONEY', 'MOOV_MONEY'].includes(mode_paiement)) {
      return res.status(400).json({
        error: 'Mode de paiement invalide',
        modes_acceptes: ['ORANGE_MONEY', 'MOOV_MONEY'],
      });
    }

    // Validation du nombre de mois
    const nbMois = parseInt(nombre_mois) || 1;
    if (nbMois < 1 || nbMois > 24) {
      return res.status(400).json({
        error: 'Le nombre de mois doit être entre 1 et 24',
      });
    }

    // Vérifier l'attribution active
    const attributionResult = await client.query(
      `SELECT a.id, l.prix_mensuel, c.nom as nom_centre
       FROM attributions a
       JOIN logements l ON a.logement_id = l.id
       JOIN centres c ON l.centre_id = c.id
       WHERE a.utilisateur_id = $1 AND a.statut = 'ACTIVE'
       LIMIT 1`,
      [userId]
    );

    if (attributionResult.rows.length === 0) {
      return res.status(400).json({
        error: 'Aucune attribution active trouvée',
      });
    }

    const attribution = attributionResult.rows[0];
    const loyerMensuel = parseFloat(attribution.prix_mensuel);
    const montantAttendu = loyerMensuel * nbMois;

    // Vérifier que le montant est un multiple exact du loyer.
    // Comparaison en entiers (FCFA sans centimes) : l'égalité stricte entre
    // flottants est fragile (ex: 3 × 16666.67).
    if (Math.round(Number(montant)) !== Math.round(montantAttendu)) {
      return res.status(400).json({
        error: `Le montant doit être un multiple du loyer mensuel (${loyerMensuel} FCFA)`,
        montant_attendu: montantAttendu,
        loyer_mensuel: loyerMensuel,
        nombre_mois: nbMois,
      });
    }

    // Calculer les dates
    const datePaiement = new Date();
    
    // Date d'échéance = fin du mois en cours
    const dateEcheance = new Date();
    dateEcheance.setMonth(dateEcheance.getMonth() + 1);
    dateEcheance.setDate(0);

    // Date de fin = date paiement + nombre de mois
    const dateFin = new Date(datePaiement);
    dateFin.setMonth(dateFin.getMonth() + nbMois);
    dateFin.setDate(dateFin.getDate() - 1); // Dernier jour de la période

    // Générer la référence
    const reference = `CENOU-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    await client.query('BEGIN');

    // Créer le paiement
    const paiementResult = await client.query(
      `INSERT INTO paiements 
         (attribution_id, montant, date_echeance, date_fin, nombre_mois, mode_paiement, reference_transaction, statut)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'EN_ATTENTE')
       RETURNING id, reference_transaction`,
      [attribution.id, montant, dateEcheance, dateFin, nbMois, mode_paiement, reference]
    );

    const paiement = paiementResult.rows[0];

    // Enregistrer la transaction
    await client.query(
      `INSERT INTO transactions (paiement_id, montant, statut, details)
       VALUES ($1, $2, 'INITIE', $3)`,
      [
        paiement.id,
        montant,
        JSON.stringify({
          mode_paiement,
          numero_telephone,
          reference,
          nombre_mois: nbMois,
          loyer_mensuel: loyerMensuel,
          date_debut: datePaiement.toISOString(),
          date_fin: dateFin.toISOString(),
          timestamp: new Date().toISOString(),
        }),
      ]
    );

    await client.query('COMMIT');

    // Initier paiement mobile money
    let paiementUrl = null;
    let externalTransactionId = null;

    try {
      if (mode_paiement === 'ORANGE_MONEY') {
        const orangeResult = await initierOrangeMoney(montant, numero_telephone, reference);
        paiementUrl = orangeResult.payment_url;
        externalTransactionId = orangeResult.transaction_id;
      } else if (mode_paiement === 'MOOV_MONEY') {
        const moovResult = await initierMoovMoney(montant, numero_telephone, reference);
        paiementUrl = moovResult.payment_url;
        externalTransactionId = moovResult.transaction_id;
      }

      if (externalTransactionId) {
        await client.query(
          `UPDATE paiements SET reference_transaction = $1 WHERE id = $2`,
          [`${reference}-${externalTransactionId}`, paiement.id]
        );
      }
    } catch (paymentError) {
      console.error('Erreur initiation mobile money:', paymentError);
      await client.query(
        `UPDATE paiements SET statut = 'ECHEC' WHERE id = $1`,
        [paiement.id]
      );
      return res.status(500).json({
        error: 'Erreur lors de l\'initiation du paiement mobile money',
        details: paymentError.message,
      });
    }

    res.status(201).json({
      message: 'Paiement initié avec succès',
      paiement: {
        id: paiement.id,
        reference: paiement.reference_transaction,
        montant: montant,
        nombre_mois: nbMois,
        loyer_mensuel: loyerMensuel,
        mode_paiement: mode_paiement,
        statut: 'EN_ATTENTE',
        date_debut: datePaiement.toISOString().split('T')[0],
        date_fin: dateFin.toISOString().split('T')[0],
        payment_url: paiementUrl,
      },
    });

  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Erreur initiation paiement:', error);
    res.status(500).json({
      error: 'Erreur lors de l\'initiation du paiement',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined,
    });
  } finally {
    client.release();
  }
};

/**
 * Callback de confirmation de paiement (opérateur de paiement)
 * POST /api/paiements/callback
 *
 * 🔒 SÉCURITÉ : ce endpoint est public (appelé par l'opérateur), il est donc
 * protégé par un secret partagé (header x-callback-secret). Sans secret
 * configuré, le endpoint est désactivé — on ne confirme JAMAIS un paiement
 * sur la seule foi d'un POST anonyme.
 * Lors du branchement CinetPay, remplacer ce contrôle par la vérification
 * HMAC officielle (x-token) de leur documentation.
 */
const callbackPaiement = async (req, res) => {
  const callbackSecret = process.env.PAYMENT_CALLBACK_SECRET;
  if (!callbackSecret) {
    console.error('❌ Callback reçu mais PAYMENT_CALLBACK_SECRET non configuré — rejet.');
    return res.status(503).json({ error: 'Callback de paiement non configuré' });
  }

  const provided = req.headers['x-callback-secret'] || '';
  const expected = Buffer.from(callbackSecret);
  const received = Buffer.from(String(provided));
  const secretOk = expected.length === received.length &&
    crypto.timingSafeEqual(expected, received);
  if (!secretOk) {
    console.warn('⚠️ Callback paiement avec secret invalide — rejet.');
    return res.status(401).json({ error: 'Non autorisé' });
  }

  const client = await db.getClient();

  try {
    const { reference, statut, transaction_id, mode_paiement } = req.body;

    // Référence strictement validée : pas de LIKE sur une entrée libre
    // (une référence '%' matchait n'importe quel paiement).
    if (typeof reference !== 'string' || !/^CENOU-\d+-[A-F0-9]{8}$/.test(reference)) {
      return res.status(400).json({ error: 'Référence invalide' });
    }

    console.log('📩 Callback paiement reçu:', { reference, statut, transaction_id, mode_paiement });

    // La référence stockée est soit exacte, soit suffixée de l'ID opérateur
    const paiementResult = await client.query(
      `SELECT p.id, p.attribution_id, p.montant, p.statut,
              a.utilisateur_id
       FROM paiements p
       JOIN attributions a ON p.attribution_id = a.id
       WHERE p.reference_transaction = $1
          OR p.reference_transaction LIKE $1 || '-%'`,
      [reference]
    );

    if (paiementResult.rows.length === 0) {
      console.error('❌ Paiement introuvable pour la référence:', reference);
      return res.status(404).json({
        error: 'Paiement introuvable',
      });
    }

    const paiement = paiementResult.rows[0];

    // Idempotence : un paiement déjà confirmé ne change plus d'état via callback
    if (paiement.statut === 'CONFIRME') {
      return res.json({ message: 'Paiement déjà confirmé', statut: 'CONFIRME' });
    }

    await client.query('BEGIN');

    // Mettre à jour le statut du paiement
    let nouveauStatut = 'EN_ATTENTE';
    if (statut === 'SUCCESS' || statut === 'COMPLETED') {
      nouveauStatut = 'CONFIRME';
    } else if (statut === 'FAILED' || statut === 'CANCELLED') {
      nouveauStatut = 'ECHEC';
    }

    await client.query(
  `UPDATE paiements 
   SET statut = $1::varchar, 
       date_paiement = CASE WHEN $1::varchar = 'CONFIRME' THEN CURRENT_TIMESTAMP ELSE date_paiement END
   WHERE id = $2`,
  [nouveauStatut, paiement.id]
  );

    // Enregistrer la transaction de callback
    await client.query(
      `INSERT INTO transactions (paiement_id, montant, statut, details)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [
        paiement.id,
        paiement.montant,
        nouveauStatut,
        JSON.stringify({
          callback: true,
          transaction_id,
          mode_paiement,
          statut,
          timestamp: new Date().toISOString(),
        }),
      ]
    );

    await client.query('COMMIT');

    // Envoyer une notification à l'utilisateur si Firebase disponible
    if (isFirebaseAvailable() && nouveauStatut === 'CONFIRME') {
      try {
        await firebaseDb.collection('notifications').add({
          userId: paiement.utilisateur_id,
          title: 'Paiement confirmé ✅',
          message: `Votre paiement de ${paiement.montant} FCFA a été confirmé.`,
          type: 'PAIEMENT',
          data: {
            paiement_id: paiement.id,
            montant: paiement.montant,
            reference: reference,
          },
          read: false,
          createdAt: new Date().toISOString(),
        });
        console.log('✅ Notification Firebase envoyée');
      } catch (notifError) {
        console.error('⚠️ Erreur notification Firebase:', notifError.message);
      }
    }

    console.log('✅ Paiement mis à jour:', { id: paiement.id, statut: nouveauStatut });

    res.json({
      message: 'Callback traité avec succès',
      statut: nouveauStatut,
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Erreur callback paiement:', error);
    res.status(500).json({
      error: 'Erreur lors du traitement du callback',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined,
    });
  } finally {
    client.release();
  }
};

/**
 * SIMULATION — Confirmer son propre paiement en attente
 * POST /api/paiements/:id/simuler
 *
 * Tant que l'intégration CinetPay n'est pas branchée, ce endpoint permet à
 * l'étudiant (authentifié, propriétaire du paiement) de simuler la
 * confirmation. Désactivable en mettant PAYMENT_SIMULATION=false.
 * À SUPPRIMER (ou désactiver) dès que CinetPay est en production.
 */
const simulerConfirmation = async (req, res) => {
  if (process.env.PAYMENT_SIMULATION === 'false') {
    return res.status(403).json({ error: 'La simulation de paiement est désactivée' });
  }

  const client = await db.getClient();

  try {
    const userId = req.user.id;
    const paiementId = req.params.id;

    // Le paiement doit appartenir à l'utilisateur connecté et être en attente
    const result = await client.query(
      `SELECT p.id, p.montant, p.statut, a.utilisateur_id
       FROM paiements p
       JOIN attributions a ON p.attribution_id = a.id
       WHERE p.id = $1 AND a.utilisateur_id = $2`,
      [paiementId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Paiement introuvable' });
    }

    const paiement = result.rows[0];
    if (paiement.statut !== 'EN_ATTENTE') {
      return res.status(409).json({
        error: `Ce paiement n'est pas en attente (statut: ${paiement.statut})`,
      });
    }

    await client.query('BEGIN');

    await client.query(
      `UPDATE paiements
       SET statut = 'CONFIRME', date_paiement = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [paiementId]
    );

    await client.query(
      `INSERT INTO transactions (paiement_id, montant, statut, details)
       VALUES ($1, $2, 'CONFIRME', $3::jsonb)`,
      [
        paiementId,
        paiement.montant,
        JSON.stringify({
          simulation: true,
          confirme_par: userId,
          timestamp: new Date().toISOString(),
        }),
      ]
    );

    await client.query('COMMIT');

    if (isFirebaseAvailable()) {
      try {
        await firebaseDb.collection('notifications').add({
          userId,
          title: 'Paiement confirmé ✅',
          message: `Votre paiement de ${paiement.montant} FCFA a été confirmé (simulation).`,
          type: 'PAIEMENT',
          data: { paiement_id: paiement.id, montant: paiement.montant },
          read: false,
          createdAt: new Date().toISOString(),
        });
      } catch (notifError) {
        console.error('⚠️ Erreur notification Firebase:', notifError.message);
      }
    }

    res.json({
      message: 'Paiement confirmé (simulation)',
      paiement: { id: paiement.id, statut: 'CONFIRME' },
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Erreur simulation paiement:', error);
    res.status(500).json({
      error: 'Erreur lors de la confirmation du paiement',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined,
    });
  } finally {
    client.release();
  }
};

/**
 * Fonction helper pour initier un paiement Orange Money
 */
async function initierOrangeMoney(montant, telephone, reference) {
  // Simulation de l'API Orange Money
  // En production, remplacer par l'API réelle
  console.log('🍊 Initiation paiement Orange Money:', { montant, telephone, reference });

  // Exemple de requête réelle (à adapter selon la documentation Orange Money)
  /*
  const response = await axios.post(
    process.env.ORANGE_MONEY_API_URL + '/payment',
    {
      amount: montant,
      phone: telephone,
      reference: reference,
      callback_url: process.env.API_URL + '/api/paiements/callback',
    },
    {
      headers: {
        'Authorization': `Bearer ${process.env.ORANGE_MONEY_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );
  return response.data;
  */

  // Simulation pour développement
  return {
    payment_url: `https://payment.orange.bf/pay?ref=${reference}`,
    transaction_id: `OM-${Date.now()}`,
    status: 'pending',
  };
}

/**
 * Fonction helper pour initier un paiement Moov Money
 */
async function initierMoovMoney(montant, telephone, reference) {
  // Simulation de l'API Moov Money
  // En production, remplacer par l'API réelle
  console.log('📱 Initiation paiement Moov Money:', { montant, telephone, reference });

  // Exemple de requête réelle (à adapter selon la documentation Moov Money)
  /*
  const response = await axios.post(
    process.env.MOOV_MONEY_API_URL + '/payment',
    {
      amount: montant,
      phone: telephone,
      reference: reference,
      callback_url: process.env.API_URL + '/api/paiements/callback',
    },
    {
      headers: {
        'Authorization': `Bearer ${process.env.MOOV_MONEY_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );
  return response.data;
  */

  // Simulation pour développement
  return {
    payment_url: `https://payment.moov.bf/pay?ref=${reference}`,
    transaction_id: `MM-${Date.now()}`,
    status: 'pending',
  };
}

module.exports = {
  getPaiements,
  getPaiementById,
  getPendingPaiements,
  initierPaiement,
  callbackPaiement,
  simulerConfirmation,
};