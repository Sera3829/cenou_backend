const db = require('../config/database');
const { db: firebaseDb, messaging, isFirebaseAvailable } = require('../config/firebase');
const notificationBroadcast = require('../services/notificationBroadcastService');

/**
 * Enregistrer le token FCM d'un appareil
 * POST /api/notifications/register-token
 */
const registerFCMToken = async (req, res) => {
  try {
    const userId = req.user.id;
    const { fcm_token, device_type } = req.body;

    if (!isFirebaseAvailable()) {
      return res.status(503).json({
        error: 'Service de notifications non disponible',
      });
    }

    // ✅ CORRIGÉ : Utiliser fcm_token partout
    await firebaseDb.collection('fcm_tokens').doc(userId.toString()).set({
      userId: userId,
      fcm_token: fcm_token,  // ✅ CLEF CORRECTE
      deviceType: device_type || 'android',
      registeredAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    }, { merge: true });

    console.log(`✅ Token FCM enregistré pour utilisateur ${userId}`);

    res.json({
      message: 'Token FCM enregistré avec succès',
    });
  } catch (error) {
    console.error('Erreur lors de l\'enregistrement du token FCM:', error);
    res.status(500).json({
      error: 'Erreur lors de l\'enregistrement du token FCM',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined,
    });
  }
};

/**
 * Diffusion en masse — délègue au service partagé notificationBroadcastService
 * (même logique réutilisée par le domaine annonces, plus de duplication).
 */
const sendBulkNotificationsDirect = (annonceId, titre, message, type, userIds, createdBy) =>
  notificationBroadcast.diffuserAnnonce(annonceId, titre, message, type, userIds, createdBy);

/**
 * Récupérer l'historique des notifications de l'utilisateur
 * GET /api/notifications
 */
const getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 50, read } = req.query;

    console.log(`🔍 Récupération notifications pour userId: ${userId}`);

    if (!isFirebaseAvailable()) {
      return res.status(503).json({
        error: 'Service de notifications non disponible',
      });
    }

    const userIdNumber = parseInt(userId);

    let query = firebaseDb
      .collection('notifications')
      .where('userId', '==', userIdNumber)
      .orderBy('createdAt', 'desc')
      .limit(parseInt(limit));

    if (read !== undefined) {
      const isRead = read === 'true';
      query = query.where('read', '==', isRead);
    }

    const snapshot = await query.get();

    const notifications = [];
    snapshot.forEach(doc => {
      notifications.push({
        id: doc.id,
        ...doc.data(),
      });
    });

    console.log(`📬 ${notifications.length} notifications trouvées`);

    const unreadSnapshot = await firebaseDb
      .collection('notifications')
      .where('userId', '==', userIdNumber)
      .where('read', '==', false)
      .get();

    res.json({
      notifications: notifications,
      total: notifications.length,
      unread_count: unreadSnapshot.size,
    });
  } catch (error) {
    console.error('Erreur récupération notifications:', error);
    res.status(500).json({
      error: 'Erreur lors de la récupération des notifications',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined,
    });
  }
};

/**
 * Marquer une notification comme lue
 * PUT /api/notifications/:id/read
 */
const markNotificationAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const notificationId = req.params.id;

    if (!isFirebaseAvailable()) {
      return res.status(503).json({
        error: 'Service de notifications non disponible',
      });
    }

    const notificationRef = firebaseDb.collection('notifications').doc(notificationId);
    const notificationDoc = await notificationRef.get();

    if (!notificationDoc.exists) {
      return res.status(404).json({
        error: 'Notification introuvable',
      });
    }

    const notification = notificationDoc.data();

    if (notification.userId !== parseInt(userId)) {
      return res.status(403).json({
        error: 'Accès non autorisé',
      });
    }

    await notificationRef.update({
      read: true,
      readAt: new Date().toISOString(),
    });

    res.json({
      message: 'Notification marquée comme lue',
    });
  } catch (error) {
    console.error('Erreur marquage notification:', error);
    res.status(500).json({
      error: 'Erreur lors du marquage de la notification',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined,
    });
  }
};

/**
 * Marquer toutes les notifications comme lues
 * PUT /api/notifications/read-all
 */
const markAllNotificationsAsRead = async (req, res) => {
  try {
    const userId = req.user.id;

    if (!isFirebaseAvailable()) {
      return res.status(503).json({
        error: 'Service de notifications non disponible',
      });
    }

    const snapshot = await firebaseDb
      .collection('notifications')
      .where('userId', '==', parseInt(userId))
      .where('read', '==', false)
      .get();

    const batch = firebaseDb.batch();
    snapshot.forEach(doc => {
      batch.update(doc.ref, {
        read: true,
        readAt: new Date().toISOString(),
      });
    });

    await batch.commit();

    res.json({
      message: `${snapshot.size} notification(s) marquée(s) comme lue(s)`,
      count: snapshot.size,
    });
  } catch (error) {
    console.error('Erreur marquage notifications:', error);
    res.status(500).json({
      error: 'Erreur lors du marquage des notifications',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined,
    });
  }
};

/**
 * Supprimer une notification
 * DELETE /api/notifications/:id
 */
const deleteNotification = async (req, res) => {
  try {
    const userId = req.user.id;
    const notificationId = req.params.id;

    if (!isFirebaseAvailable()) {
      return res.status(503).json({
        error: 'Service de notifications non disponible',
      });
    }

    const notificationRef = firebaseDb.collection('notifications').doc(notificationId);
    const notificationDoc = await notificationRef.get();

    if (!notificationDoc.exists) {
      return res.status(404).json({
        error: 'Notification introuvable',
      });
    }

    const notification = notificationDoc.data();

    if (notification.userId !== parseInt(userId)) {
      return res.status(403).json({
        error: 'Accès non autorisé',
      });
    }

    await notificationRef.delete();

    res.json({
      message: 'Notification supprimée avec succès',
    });
  } catch (error) {
    console.error('Erreur suppression notification:', error);
    res.status(500).json({
      error: 'Erreur lors de la suppression de la notification',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined,
    });
  }
};

/**
 * Envoyer une notification à un utilisateur
 * POST /api/notifications/send
 */
const sendNotification = async (req, res) => {
  try {
    const { userId, title, message, type, data } = req.body;

    if (!isFirebaseAvailable()) {
      return res.status(503).json({
        error: 'Service de notifications non disponible',
      });
    }

    const tokenDoc = await firebaseDb.collection('fcm_tokens').doc(userId.toString()).get();

    if (!tokenDoc.exists) {
      return res.status(404).json({
        error: 'Token FCM non trouvé',
      });
    }

    const fcmToken = tokenDoc.data().fcm_token;  // ✅ CLEF CORRECTE

    const notificationRef = await firebaseDb.collection('notifications').add({
      userId: parseInt(userId),
      title: title,
      message: message,
      type: type || 'INFO',
      data: data || {},
      read: false,
      createdAt: new Date().toISOString(),
    });

    const payload = {
      notification: {
        title: title,
        body: message,
      },
      data: {
        notificationId: notificationRef.id,
        type: type || 'INFO',
        ...data,
      },
      token: fcmToken,
    };

    const response = await messaging.send(payload);

    res.json({
      message: 'Notification envoyée avec succès',
      notificationId: notificationRef.id,
      fcmResponse: response,
    });
  } catch (error) {
    console.error('Erreur envoi notification:', error);
    res.status(500).json({
      error: 'Erreur lors de l\'envoi de la notification',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined,
    });
  }
};

/**
 * Envoyer des notifications groupées
 * POST /api/notifications/send-bulk
 */
const sendBulkNotifications = async (req, res) => {
  try {
    const { userIds, title, message, type, data } = req.body;

    if (!isFirebaseAvailable()) {
      return res.status(503).json({
        error: 'Service de notifications non disponible',
      });
    }

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        error: 'Liste des utilisateurs requise',
      });
    }

    const results = {
      success: [],
      failed: [],
    };

    for (const userId of userIds) {
      try {
        const tokenDoc = await firebaseDb.collection('fcm_tokens').doc(userId.toString()).get();

        if (!tokenDoc.exists) {
          results.failed.push({ userId, reason: 'Token non trouvé' });
          continue;
        }

        const fcmToken = tokenDoc.data().fcm_token;  // ✅ CLEF CORRECTE

        const notificationRef = await firebaseDb.collection('notifications').add({
          userId: parseInt(userId),
          title: title,
          message: message,
          type: type || 'INFO',
          data: data || {},
          read: false,
          createdAt: new Date().toISOString(),
        });

        const payload = {
          notification: {
            title: title,
            body: message,
          },
          data: {
            notificationId: notificationRef.id,
            type: type || 'INFO',
            ...data,
          },
          token: fcmToken,
        };

        await messaging.send(payload);
        results.success.push({ userId, notificationId: notificationRef.id });

      } catch (error) {
        results.failed.push({ userId, reason: error.message });
      }
    }

    res.json({
      message: 'Notifications envoyées',
      total: userIds.length,
      success: results.success.length,
      failed: results.failed.length,
      results: results,
    });
  } catch (error) {
    console.error('Erreur envoi bulk:', error);
    res.status(500).json({
      error: 'Erreur lors de l\'envoi groupé',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined,
    });
  }
};

/**
 * Envoyer notification par centre
 * POST /api/notifications/send-by-centre
 */
const sendNotificationByCentre = async (req, res) => {
  try {
    const { centre_id, title, message, type, data } = req.body;

    const result = await db.query(
      `SELECT DISTINCT a.utilisateur_id
       FROM attributions a
       JOIN logements l ON a.logement_id = l.id
       WHERE l.centre_id = $1 AND a.statut = 'ACTIVE'`,
      [centre_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Aucun étudiant dans ce centre',
      });
    }

    const userIds = result.rows.map(row => row.utilisateur_id);
    req.body.userIds = userIds;
    await sendBulkNotifications(req, res);
  } catch (error) {
    console.error('Erreur envoi par centre:', error);
    res.status(500).json({
      error: 'Erreur lors de l\'envoi par centre',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined,
    });
  }
};

/**
 * Endpoint de diagnostic pour vérifier le type de userId
 * GET /api/notifications/debug-user-type
 */
const debugUserType = async (req, res) => {
  try {
    const userId = req.user.id;
    
    console.log('🔍 DEBUG userId:', {
      value: userId,
      type: typeof userId,
      asString: userId.toString(),
      asNumber: parseInt(userId),
    });

    if (!isFirebaseAvailable()) {
      return res.status(503).json({
        error: 'Firebase non disponible'
      });
    }

    // Vérifier dans Firebase
    const tokenDoc = await firebaseDb.collection('fcm_tokens').doc(userId.toString()).get();
    const tokenData = tokenDoc.exists ? tokenDoc.data() : null;

    // Chercher les notifications
    const notificationsSnapshot = await firebaseDb
      .collection('notifications')
      .where('userId', '==', parseInt(userId))
      .limit(5)
      .get();

    const notifications = [];
    notificationsSnapshot.forEach(doc => {
      const data = doc.data();
      notifications.push({
        id: doc.id,
        userId: data.userId,
        userIdType: typeof data.userId,
        title: data.title,
      });
    });

    res.json({
      user: {
        id: userId,
        type: typeof userId,
        asNumber: parseInt(userId),
      },
      fcmToken: tokenData ? {
        userId: tokenData.userId,
        userIdType: typeof tokenData.userId,
        fcm_token: tokenData.fcm_token ? 'present' : 'missing',
      } : null,
      notifications: notifications,
      notificationsCount: notifications.length,
    });

  } catch (error) {
    console.error('Erreur debug:', error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  registerFCMToken,
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  sendNotification,
  sendBulkNotifications,
  sendBulkNotificationsDirect,
  sendNotificationByCentre,
  debugUserType,
};