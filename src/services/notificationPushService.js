/**
 * Service d'envoi de notifications in-app (Firestore).
 * Toujours non bloquant : une panne Firebase ne doit jamais faire échouer
 * l'opération métier qui la déclenche.
 */
const { db: firebaseDb, isFirebaseAvailable } = require('../config/firebase');

const envoyer = async ({ userId, title, message, type, data = {} }) => {
  if (!isFirebaseAvailable()) return;
  try {
    await firebaseDb.collection('notifications').add({
      userId,
      title,
      message,
      type,
      data,
      read: false,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('⚠️ Notification Firebase (non bloquante):', err.message);
  }
};

module.exports = { envoyer };
