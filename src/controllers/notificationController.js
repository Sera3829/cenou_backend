/**
 * Contrôleur notifications : traduction HTTP ↔ service.
 * Voir services/notificationService.js. La diffusion en masse (annonces)
 * passe par services/notificationBroadcastService.
 */
const notificationService = require('../services/notificationService');
const notificationBroadcast = require('../services/notificationBroadcastService');
const { repondreErreur } = require('../utils/httpError');

/** POST /api/notifications/register-token */
const registerFCMToken = async (req, res) => {
  try {
    await notificationService.enregistrerToken(req.user.id, req.body);
    res.json({ message: 'Token FCM enregistré avec succès' });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de l\'enregistrement du token FCM');
  }
};

/** GET /api/notifications */
const getNotifications = async (req, res) => {
  try {
    const data = await notificationService.liste(req.user.id, req.query);
    res.json(data);
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la récupération des notifications');
  }
};

/** PUT /api/notifications/:id/read */
const markNotificationAsRead = async (req, res) => {
  try {
    await notificationService.marquerLue(req.user.id, req.params.id);
    res.json({ message: 'Notification marquée comme lue' });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors du marquage de la notification');
  }
};

/** PUT /api/notifications/read-all */
const markAllNotificationsAsRead = async (req, res) => {
  try {
    const count = await notificationService.marquerToutesLues(req.user.id);
    res.json({ message: `${count} notification(s) marquée(s) comme lue(s)`, count });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors du marquage des notifications');
  }
};

/** DELETE /api/notifications/:id */
const deleteNotification = async (req, res) => {
  try {
    await notificationService.supprimer(req.user.id, req.params.id);
    res.json({ message: 'Notification supprimée avec succès' });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de la suppression de la notification');
  }
};

/** POST /api/notifications/send */
const sendNotification = async (req, res) => {
  try {
    const data = await notificationService.envoyerAUtilisateur(req.body);
    res.json({ message: 'Notification envoyée avec succès', ...data });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de l\'envoi de la notification');
  }
};

/** POST /api/notifications/send-bulk */
const sendBulkNotifications = async (req, res) => {
  try {
    const data = await notificationService.envoyerGroupe(req.body);
    res.json({ message: 'Notifications envoyées', ...data });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de l\'envoi groupé');
  }
};

/** POST /api/notifications/send-by-centre */
const sendNotificationByCentre = async (req, res) => {
  try {
    const data = await notificationService.envoyerParCentre(req.body);
    res.json({ message: 'Notifications envoyées', ...data });
  } catch (error) {
    repondreErreur(res, error, 'Erreur lors de l\'envoi par centre');
  }
};

/** GET /api/notifications/debug-user-type */
const debugUserType = async (req, res) => {
  try {
    const data = await notificationService.debugUserType(req.user.id);
    res.json(data);
  } catch (error) {
    repondreErreur(res, error, 'Erreur de diagnostic');
  }
};

// Diffusion en masse d'une annonce (réutilisée par le domaine annonces)
const sendBulkNotificationsDirect = (annonceId, titre, message, type, userIds, createdBy) =>
  notificationBroadcast.diffuserAnnonce(annonceId, titre, message, type, userIds, createdBy);

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
