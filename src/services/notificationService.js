/**
 * Logique métier : notifications (tokens FCM, historique, envoi).
 * Le stockage est Firestore ; les envois passent par FCM.
 */
const { db: firebaseDb, messaging, isFirebaseAvailable } = require('../config/firebase');
const { HttpError } = require('../utils/httpError');
const centreRepository = require('../repositories/centreRepository');

const exigerFirebase = () => {
  if (!isFirebaseAvailable()) {
    throw new HttpError(503, 'Service de notifications non disponible');
  }
};

const enregistrerToken = async (userId, { fcm_token, device_type }) => {
  exigerFirebase();
  await firebaseDb.collection('fcm_tokens').doc(userId.toString()).set({
    userId,
    fcm_token,
    deviceType: device_type || 'android',
    registeredAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
  }, { merge: true });
};

const liste = async (userId, { limit = 50, read }) => {
  exigerFirebase();
  const userIdNumber = parseInt(userId);

  let query = firebaseDb.collection('notifications')
    .where('userId', '==', userIdNumber)
    .orderBy('createdAt', 'desc')
    .limit(parseInt(limit));
  if (read !== undefined) {
    query = query.where('read', '==', read === 'true');
  }

  const snapshot = await query.get();
  const notifications = [];
  snapshot.forEach((doc) => notifications.push({ id: doc.id, ...doc.data() }));

  const unread = await firebaseDb.collection('notifications')
    .where('userId', '==', userIdNumber)
    .where('read', '==', false)
    .get();

  return { notifications, total: notifications.length, unread_count: unread.size };
};

/** Charge une notification et vérifie qu'elle appartient à l'utilisateur */
const _chargerPossedee = async (notificationId, userId) => {
  const ref = firebaseDb.collection('notifications').doc(notificationId);
  const doc = await ref.get();
  if (!doc.exists) {
    throw new HttpError(404, 'Notification introuvable');
  }
  if (doc.data().userId !== parseInt(userId)) {
    throw new HttpError(403, 'Accès non autorisé');
  }
  return ref;
};

const marquerLue = async (userId, notificationId) => {
  exigerFirebase();
  const ref = await _chargerPossedee(notificationId, userId);
  await ref.update({ read: true, readAt: new Date().toISOString() });
};

const marquerToutesLues = async (userId) => {
  exigerFirebase();
  const snapshot = await firebaseDb.collection('notifications')
    .where('userId', '==', parseInt(userId))
    .where('read', '==', false)
    .get();
  const batch = firebaseDb.batch();
  snapshot.forEach((doc) => batch.update(doc.ref, { read: true, readAt: new Date().toISOString() }));
  await batch.commit();
  return snapshot.size;
};

const supprimer = async (userId, notificationId) => {
  exigerFirebase();
  const ref = await _chargerPossedee(notificationId, userId);
  await ref.delete();
};

/** Envoi à un utilisateur : crée la notif Firestore + push FCM */
const envoyerAUtilisateur = async ({ userId, title, message, type, data }) => {
  exigerFirebase();
  const tokenDoc = await firebaseDb.collection('fcm_tokens').doc(userId.toString()).get();
  if (!tokenDoc.exists) {
    throw new HttpError(404, 'Token FCM non trouvé');
  }
  const fcmToken = tokenDoc.data().fcm_token;

  const ref = await firebaseDb.collection('notifications').add({
    userId: parseInt(userId), title, message, type: type || 'INFO',
    data: data || {}, read: false, createdAt: new Date().toISOString(),
  });

  const fcmResponse = await messaging.send({
    notification: { title, body: message },
    data: { notificationId: ref.id, type: type || 'INFO', ...data },
    token: fcmToken,
  });

  return { notificationId: ref.id, fcmResponse };
};

/** Envoi groupé (résultats par utilisateur) */
const envoyerGroupe = async ({ userIds, title, message, type, data }) => {
  exigerFirebase();
  if (!Array.isArray(userIds) || userIds.length === 0) {
    throw new HttpError(400, 'Liste des utilisateurs requise');
  }
  const results = { success: [], failed: [] };
  for (const userId of userIds) {
    try {
      const tokenDoc = await firebaseDb.collection('fcm_tokens').doc(userId.toString()).get();
      if (!tokenDoc.exists) { results.failed.push({ userId, reason: 'Token non trouvé' }); continue; }
      const fcmToken = tokenDoc.data().fcm_token;
      const ref = await firebaseDb.collection('notifications').add({
        userId: parseInt(userId), title, message, type: type || 'INFO',
        data: data || {}, read: false, createdAt: new Date().toISOString(),
      });
      await messaging.send({
        notification: { title, body: message },
        data: { notificationId: ref.id, type: type || 'INFO', ...data },
        token: fcmToken,
      });
      results.success.push({ userId, notificationId: ref.id });
    } catch (error) {
      results.failed.push({ userId, reason: error.message });
    }
  }
  return { total: userIds.length, success: results.success.length, failed: results.failed.length, results };
};

const envoyerParCentre = async ({ centre_id, title, message, type, data }) => {
  const userIds = await centreRepository.idsUtilisateursActifs(centre_id);
  if (userIds.length === 0) {
    throw new HttpError(404, 'Aucun étudiant dans ce centre');
  }
  return envoyerGroupe({ userIds, title, message, type, data });
};

const debugUserType = async (userId) => {
  exigerFirebase();
  const tokenDoc = await firebaseDb.collection('fcm_tokens').doc(userId.toString()).get();
  return {
    userId: { value: userId, type: typeof userId, asString: userId.toString(), asNumber: parseInt(userId) },
    token_found: tokenDoc.exists,
    token_data: tokenDoc.exists ? tokenDoc.data() : null,
  };
};

module.exports = {
  enregistrerToken,
  liste,
  marquerLue,
  marquerToutesLues,
  supprimer,
  envoyerAUtilisateur,
  envoyerGroupe,
  envoyerParCentre,
  debugUserType,
};
