/**
 * Logique métier : paiements de loyers.
 * Montants, échéances, callback opérateur, simulation, administration.
 */
const crypto = require('crypto');
const db = require('../config/database');
const { HttpError } = require('../utils/httpError');
const paiementRepository = require('../repositories/paiementRepository');
const logementRepository = require('../repositories/logementRepository');
const notificationPush = require('./notificationPushService');

// ── Opérateurs mobile money (SIMULATION — CinetPay à brancher) ───────────

async function initierOrangeMoney(montant, telephone, reference) {
  console.log('🍊 Initiation paiement Orange Money (simulation):', { montant, telephone, reference });
  return {
    payment_url: `https://payment.orange.bf/pay?ref=${reference}`,
    transaction_id: `OM-${Date.now()}`,
    status: 'pending',
  };
}

async function initierMoovMoney(montant, telephone, reference) {
  console.log('📱 Initiation paiement Moov Money (simulation):', { montant, telephone, reference });
  return {
    payment_url: `https://payment.moov.bf/pay?ref=${reference}`,
    transaction_id: `MM-${Date.now()}`,
    status: 'pending',
  };
}

// ── Côté étudiant ────────────────────────────────────────────────────────

const listerPourUtilisateur = (utilisateurId) =>
  paiementRepository.listeParUtilisateur(utilisateurId);

const detailPourUtilisateur = async (paiementId, utilisateurId) => {
  const paiement = await paiementRepository.detailPourUtilisateur(paiementId, utilisateurId);
  if (!paiement) {
    throw new HttpError(404, 'Paiement introuvable ou accès non autorisé');
  }
  return paiement;
};

const enAttentePourUtilisateur = (utilisateurId) =>
  paiementRepository.enAttenteParUtilisateur(utilisateurId);

const loyerDeLUtilisateur = async (utilisateurId) => {
  const attribution = await logementRepository.attributionActive(utilisateurId);
  if (!attribution) {
    throw new HttpError(404, 'Aucune attribution active trouvée');
  }
  return attribution;
};

/**
 * Initier un paiement mobile money.
 * Règles : 1-24 mois, montant = loyer × mois (comparaison en entiers FCFA).
 */
const initier = async (utilisateurId, { montant, mode_paiement, numero_telephone, nombre_mois }) => {
  if (!['ORANGE_MONEY', 'MOOV_MONEY'].includes(mode_paiement)) {
    throw new HttpError(400, 'Mode de paiement invalide', {
      modes_acceptes: ['ORANGE_MONEY', 'MOOV_MONEY'],
    });
  }

  const nbMois = parseInt(nombre_mois) || 1;
  if (nbMois < 1 || nbMois > 24) {
    throw new HttpError(400, 'Le nombre de mois doit être entre 1 et 24');
  }

  const client = await db.getClient();
  try {
    const attribution = await logementRepository.attributionActive(utilisateurId, client);
    if (!attribution) {
      throw new HttpError(400, 'Aucune attribution active trouvée');
    }

    const loyerMensuel = parseFloat(attribution.prix_mensuel);
    const montantAttendu = loyerMensuel * nbMois;

    // Comparaison en entiers (FCFA sans centimes) : l'égalité stricte
    // entre flottants est fragile (ex: 3 × 16666.67)
    if (Math.round(Number(montant)) !== Math.round(montantAttendu)) {
      throw new HttpError(400, `Le montant doit être un multiple du loyer mensuel (${loyerMensuel} FCFA)`, {
        montant_attendu: montantAttendu,
        loyer_mensuel: loyerMensuel,
        nombre_mois: nbMois,
      });
    }

    // Échéance = fin du mois courant ; fin de période = début + nbMois - 1 jour
    const datePaiement = new Date();
    const dateEcheance = new Date();
    dateEcheance.setMonth(dateEcheance.getMonth() + 1);
    dateEcheance.setDate(0);
    const dateFin = new Date(datePaiement);
    dateFin.setMonth(dateFin.getMonth() + nbMois);
    dateFin.setDate(dateFin.getDate() - 1);

    const reference = `CENOU-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    await client.query('BEGIN');

    const paiement = await paiementRepository.inserer(
      {
        attributionId: attribution.id,
        montant,
        dateEcheance,
        dateFin,
        nombreMois: nbMois,
        modePaiement: mode_paiement,
        reference,
      },
      client
    );

    await paiementRepository.insererTransaction(
      {
        paiementId: paiement.id,
        montant,
        statut: 'INITIE',
        details: {
          mode_paiement,
          numero_telephone,
          reference,
          nombre_mois: nbMois,
          loyer_mensuel: loyerMensuel,
          date_debut: datePaiement.toISOString(),
          date_fin: dateFin.toISOString(),
          timestamp: new Date().toISOString(),
        },
      },
      client
    );

    await client.query('COMMIT');

    // Initier le paiement chez l'opérateur (hors transaction)
    let paiementUrl = null;
    try {
      const resultat = mode_paiement === 'ORANGE_MONEY'
        ? await initierOrangeMoney(montant, numero_telephone, reference)
        : await initierMoovMoney(montant, numero_telephone, reference);

      paiementUrl = resultat.payment_url;
      if (resultat.transaction_id) {
        await paiementRepository.mettreAJourReference(
          paiement.id,
          `${reference}-${resultat.transaction_id}`,
          client
        );
      }
    } catch (paymentError) {
      console.error('Erreur initiation mobile money:', paymentError);
      await paiementRepository.marquerEchec(paiement.id, client);
      throw new HttpError(500, 'Erreur lors de l\'initiation du paiement mobile money', {
        details: process.env.NODE_ENV !== 'production' ? paymentError.message : undefined,
      });
    }

    return {
      id: paiement.id,
      reference: paiement.reference_transaction,
      montant,
      nombre_mois: nbMois,
      loyer_mensuel: loyerMensuel,
      mode_paiement,
      statut: 'EN_ATTENTE',
      date_debut: datePaiement.toISOString().split('T')[0],
      date_fin: dateFin.toISOString().split('T')[0],
      payment_url: paiementUrl,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

// ── Callback opérateur ───────────────────────────────────────────────────

const FORMAT_REFERENCE = /^CENOU-\d+-[A-F0-9]{8}$/;

/**
 * Traiter le callback de l'opérateur de paiement.
 * Le secret a déjà été vérifié par le contrôleur (concern HTTP).
 */
const traiterCallback = async ({ reference, statut, transaction_id, mode_paiement }) => {
  // Référence strictement validée : pas de LIKE sur une entrée libre
  if (typeof reference !== 'string' || !FORMAT_REFERENCE.test(reference)) {
    throw new HttpError(400, 'Référence invalide');
  }

  console.log('📩 Callback paiement reçu:', { reference, statut, transaction_id, mode_paiement });

  const client = await db.getClient();
  try {
    const paiement = await paiementRepository.trouverParReference(reference, client);
    if (!paiement) {
      console.error('❌ Paiement introuvable pour la référence:', reference);
      throw new HttpError(404, 'Paiement introuvable');
    }

    // Idempotence : un paiement déjà confirmé ne change plus d'état
    if (paiement.statut === 'CONFIRME') {
      return { message: 'Paiement déjà confirmé', statut: 'CONFIRME' };
    }

    let nouveauStatut = 'EN_ATTENTE';
    if (statut === 'SUCCESS' || statut === 'COMPLETED') {
      nouveauStatut = 'CONFIRME';
    } else if (statut === 'FAILED' || statut === 'CANCELLED') {
      nouveauStatut = 'ECHEC';
    }

    await client.query('BEGIN');
    await paiementRepository.changerStatutCallback(paiement.id, nouveauStatut, client);
    await paiementRepository.insererTransaction(
      {
        paiementId: paiement.id,
        montant: paiement.montant,
        statut: nouveauStatut,
        details: {
          callback: true,
          transaction_id,
          mode_paiement,
          statut,
          timestamp: new Date().toISOString(),
        },
      },
      client
    );
    await client.query('COMMIT');

    if (nouveauStatut === 'CONFIRME') {
      await notificationPush.envoyer({
        userId: paiement.utilisateur_id,
        title: 'Paiement confirmé ✅',
        message: `Votre paiement de ${paiement.montant} FCFA a été confirmé.`,
        type: 'PAIEMENT',
        data: { paiement_id: paiement.id, montant: paiement.montant, reference },
      });
    }

    console.log('✅ Paiement mis à jour:', { id: paiement.id, statut: nouveauStatut });
    return { message: 'Callback traité avec succès', statut: nouveauStatut };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

// ── Simulation (en attendant CinetPay) ───────────────────────────────────

const simulerConfirmation = async (paiementId, utilisateurId) => {
  if (process.env.PAYMENT_SIMULATION === 'false') {
    throw new HttpError(403, 'La simulation de paiement est désactivée');
  }

  const client = await db.getClient();
  try {
    const paiement = await paiementRepository.trouverPourProprietaire(paiementId, utilisateurId, client);
    if (!paiement) {
      throw new HttpError(404, 'Paiement introuvable');
    }
    if (paiement.statut !== 'EN_ATTENTE') {
      throw new HttpError(409, `Ce paiement n'est pas en attente (statut: ${paiement.statut})`);
    }

    await client.query('BEGIN');
    await paiementRepository.confirmer(paiementId, client);
    await paiementRepository.insererTransaction(
      {
        paiementId,
        montant: paiement.montant,
        statut: 'CONFIRME',
        details: { simulation: true, confirme_par: utilisateurId, timestamp: new Date().toISOString() },
      },
      client
    );
    await client.query('COMMIT');

    await notificationPush.envoyer({
      userId: utilisateurId,
      title: 'Paiement confirmé ✅',
      message: `Votre paiement de ${paiement.montant} FCFA a été confirmé (simulation).`,
      type: 'PAIEMENT',
      data: { paiement_id: paiement.id, montant: paiement.montant },
    });

    return { id: paiement.id, statut: 'CONFIRME' };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

// ── Côté admin ───────────────────────────────────────────────────────────

/**
 * centreScope : null (admin) ou id du centre (gestionnaire — cloisonné).
 * centreDemande : filtre optionnel choisi par un admin.
 */
const filtresEffectifs = (query, centreScope) => ({
  statut: query.statut,
  mode_paiement: query.mode_paiement,
  date_from: query.date_from,
  date_to: query.date_to,
  centre_id: centreScope !== null ? centreScope : query.centre_id,
  search: query.search,
});

const statistiquesAdmin = (query, centreScope) =>
  paiementRepository.statistiquesAdmin(filtresEffectifs(query, centreScope));

const listeAdmin = (query, centreScope) => {
  const page = parseInt(query.page) || 1;
  const limit = parseInt(query.limit) || 20;
  return paiementRepository
    .listeAdmin(filtresEffectifs(query, centreScope), { page, limit })
    .then(({ paiements, total }) => ({
      paiements,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    }));
};

const detailAdmin = async (paiementId, centreScope) => {
  const paiement = await paiementRepository.detailAdmin(paiementId, centreScope);
  if (!paiement) {
    throw new HttpError(404, 'Paiement non trouvé');
  }
  return paiement;
};

const changerStatutAdmin = async (paiementId, { statut, raison }, adminId, centreScope) => {
  const client = await db.getClient();
  try {
    const paiement = await paiementRepository.trouverPourMiseAJourAdmin(paiementId, centreScope, client);
    if (!paiement) {
      throw new HttpError(404, 'Paiement non trouvé');
    }

    await client.query('BEGIN');
    const misAJour = await paiementRepository.changerStatutAdmin(paiementId, statut, client);
    await paiementRepository.insererHistorique(
      { paiementId, ancienStatut: paiement.statut, nouveauStatut: statut, modifiePar: adminId, raison },
      client
    );
    if (statut === 'CONFIRME') {
      await paiementRepository.fixerDatePaiementSiAbsente(paiementId, client);
    }
    await client.query('COMMIT');

    const user = await paiementRepository.utilisateurDeLAttribution(paiement.attribution_id, client);
    if (user) {
      await notificationPush.envoyer({
        userId: user.id,
        type: 'PAIEMENT',
        title: `Paiement ${statut === 'CONFIRME' ? 'confirmé' : 'mis à jour'}`,
        message: `Votre paiement a été ${statut === 'CONFIRME' ? 'confirmé' : 'mis à jour'}`,
        data: { paiement_id: paiementId, nouveau_statut: statut },
      });
    }

    return misAJour;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  listerPourUtilisateur,
  detailPourUtilisateur,
  enAttentePourUtilisateur,
  loyerDeLUtilisateur,
  initier,
  traiterCallback,
  simulerConfirmation,
  statistiquesAdmin,
  listeAdmin,
  detailAdmin,
  changerStatutAdmin,
};
