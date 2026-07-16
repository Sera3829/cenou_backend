/**
 * Contrôleur paiements : traduction HTTP ↔ service.
 * Aucune logique métier ni SQL ici — voir services/paiementService.js.
 */
const crypto = require('crypto');
const paiementService = require('../services/paiementService');
const { getCentreScope } = require('../middlewares/authMiddleware');
const { repondreErreur } = require('../utils/httpError');

/** GET /api/paiements */
const getPaiements = async (req, res) => {
  try {
    const paiements = await paiementService.listerPourUtilisateur(req.user.id);
    res.json({ paiements, total: paiements.length });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la récupération des paiements');
  }
};

/** GET /api/paiements/:id */
const getPaiementById = async (req, res) => {
  try {
    const paiement = await paiementService.detailPourUtilisateur(req.params.id, req.user.id);
    res.json({ paiement });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la récupération du paiement');
  }
};

/** GET /api/paiements/pending */
const getPendingPaiements = async (req, res) => {
  try {
    const paiements = await paiementService.enAttentePourUtilisateur(req.user.id);
    res.json({ paiements_en_attente: paiements, total: paiements.length });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la récupération des paiements en attente');
  }
};

/** GET /api/paiements/loyer */
const getLoyer = async (req, res) => {
  try {
    const attribution = await paiementService.loyerDeLUtilisateur(req.user.id);
    res.json({
      success: true,
      data: {
        prix_mensuel: attribution.prix_mensuel,
        numero_chambre: attribution.numero_chambre,
        type_chambre: attribution.type_chambre,
        nom_centre: attribution.nom_centre,
        date_debut: attribution.date_debut,
      },
    });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la récupération du loyer');
  }
};

/** POST /api/paiements/initier */
const initierPaiement = async (req, res) => {
  try {
    const paiement = await paiementService.initier(req.user.id, req.body);
    res.status(201).json({ message: 'Paiement initié avec succès', paiement });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de l\'initiation du paiement');
  }
};

/**
 * POST /api/paiements/callback
 *
 * 🔒 Endpoint public (appelé par l'opérateur) protégé par secret partagé
 * (header x-callback-secret, comparaison à temps constant). Sans secret
 * configuré, le endpoint est désactivé — on ne confirme JAMAIS un paiement
 * sur la seule foi d'un POST anonyme.
 * Lors du branchement CinetPay : remplacer par leur vérification HMAC (x-token).
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

  try {
    const resultat = await paiementService.traiterCallback(req.body);
    res.json(resultat);
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors du traitement du callback');
  }
};

/** POST /api/paiements/:id/simuler — temporaire, en attendant CinetPay */
const simulerConfirmation = async (req, res) => {
  try {
    const paiement = await paiementService.simulerConfirmation(req.params.id, req.user.id);
    res.json({ message: 'Paiement confirmé (simulation)', paiement });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la confirmation du paiement');
  }
};

// ── Admin ────────────────────────────────────────────────────────────────

/** GET /api/paiements/admin/statistics */
const getStatistiquesAdmin = async (req, res) => {
  try {
    const data = await paiementService.statistiquesAdmin(req.query, getCentreScope(req));
    res.json({ success: true, data });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la récupération des statistiques');
  }
};

/** GET /api/paiements/admin/all */
const getListeAdmin = async (req, res) => {
  try {
    const data = await paiementService.listeAdmin(req.query, getCentreScope(req));
    res.json({ success: true, data });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la récupération des paiements');
  }
};

/** GET /api/paiements/admin/:id */
const getDetailAdmin = async (req, res) => {
  try {
    const data = await paiementService.detailAdmin(req.params.id, getCentreScope(req));
    res.json({ success: true, data });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la récupération du paiement');
  }
};

/** PUT /api/paiements/admin/:id/statut */
const changerStatutAdmin = async (req, res) => {
  try {
    const data = await paiementService.changerStatutAdmin(
      req.params.id,
      req.body,
      req.user.id,
      getCentreScope(req)
    );
    res.json({
      success: true,
      data,
      message: `Statut du paiement mis à jour: ${req.body.statut}`,
    });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la mise à jour du statut');
  }
};

module.exports = {
  getPaiements,
  getPaiementById,
  getPendingPaiements,
  getLoyer,
  initierPaiement,
  callbackPaiement,
  simulerConfirmation,
  getStatistiquesAdmin,
  getListeAdmin,
  getDetailAdmin,
  changerStatutAdmin,
};
