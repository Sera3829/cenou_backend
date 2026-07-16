/**
 * Diffusion de notifications push (FCM) à une liste de destinataires.
 * Extrait du contrôleur notifications pour être réutilisable par le domaine
 * annonces sans dépendance controller → controller.
 * Toujours tolérant aux pannes : Firebase indisponible = échec silencieux.
 */
const { db: firebaseDb, messaging, isFirebaseAvailable } = require('../config/firebase');

const tronquer = (msg) => (msg.length > 100 ? msg.substring(0, 100) + '...' : msg);

/**
 * Diffuse une annonce à une liste d'IDs utilisateurs.
 * Crée la notification dans Firestore + envoie le push FCM à chacun.
 * @returns {Promise<{success, sent, failed, total}>}
 */
const diffuserAnnonce = async (annonceId, titre, message, cible, userIds, createdBy) => {
  if (!isFirebaseAvailable()) {
    console.log('⚠️ Firebase non disponible — diffusion ignorée');
    return { success: false, sent: 0, failed: userIds?.length || 0 };
  }
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return { success: true, sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;

  for (const userId of userIds) {
    try {
      const userIdNumber = parseInt(userId);
      const tokenDoc = await firebaseDb.collection('fcm_tokens').doc(userIdNumber.toString()).get();
      if (!tokenDoc.exists) { failed++; continue; }

      const fcmToken = tokenDoc.data().fcm_token;
      if (!fcmToken) { failed++; continue; }

      const notificationRef = await firebaseDb.collection('notifications').add({
        userId: userIdNumber,
        title: titre,
        message: tronquer(message),
        type: 'ANNONCE',
        data: {
          annonce_id: String(annonceId),
          type: 'ANNONCE',
          cible: String(cible),
          created_by: String(createdBy),
        },
        read: false,
        createdAt: new Date().toISOString(),
      });

      await messaging.send({
        notification: { title: titre, body: tronquer(message) },
        data: {
          notificationId: notificationRef.id,
          annonce_id: String(annonceId),
          type: 'ANNONCE',
          cible: String(cible),
          created_by: String(createdBy),
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
        android: { priority: 'high', notification: { sound: 'default', channelId: 'annonces' } },
        apns: { payload: { aps: { sound: 'default', badge: 1 } } },
        token: fcmToken,
      });

      sent++;
    } catch (error) {
      console.error(`❌ Diffusion échouée pour userId ${userId}:`, error.message);
      failed++;
    }
  }

  console.log(`✅ [DIFFUSION] ${sent} envoyées, ${failed} échecs`);
  return { success: true, sent, failed, total: userIds.length };
};

module.exports = { diffuserAnnonce };
