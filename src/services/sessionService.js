/**
 * Sessions utilisateur (Firestore) — session unique par compte.
 * Toujours non bloquant : si Firebase est indisponible, l'authentification
 * JWT reste fonctionnelle.
 */
const { db: firebaseDb, isFirebaseAvailable } = require('../config/firebase');

const DUREE_SESSION_MS = 24 * 60 * 60 * 1000;

const enregistrer = async (userId, token) => {
  if (!isFirebaseAvailable()) return;
  try {
    await firebaseDb.collection('sessions').doc(userId.toString()).set({
      userId,
      token,
      loginAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      expiresAt: new Date(Date.now() + DUREE_SESSION_MS).toISOString(),
    });
  } catch (err) {
    console.error('⚠️ Session Firebase (non bloquante):', err.message);
  }
};

const rafraichir = async (userId, token) => {
  if (!isFirebaseAvailable()) return;
  try {
    await firebaseDb.collection('sessions').doc(userId.toString()).update({
      token,
      lastActivity: new Date().toISOString(),
      expiresAt: new Date(Date.now() + DUREE_SESSION_MS).toISOString(),
    });
  } catch (err) {
    console.error('⚠️ Session Firebase (non bloquante):', err.message);
  }
};

const supprimer = async (userId) => {
  if (!isFirebaseAvailable()) return;
  try {
    await firebaseDb.collection('sessions').doc(userId.toString()).delete();
  } catch (err) {
    console.error('⚠️ Session Firebase (non bloquante):', err.message);
  }
};

/**
 * Le token présenté correspond-il à la session active ?
 * Retourne false uniquement si une session existe ET porte un autre token.
 */
const estValide = async (userId, token) => {
  if (!isFirebaseAvailable()) return true;
  try {
    const doc = await firebaseDb.collection('sessions').doc(userId.toString()).get();
    if (!doc.exists) return true;
    const session = doc.data();
    return !session.token || session.token === token;
  } catch (err) {
    console.error('⚠️ Vérification session Firebase (non bloquante):', err.message);
    return true;
  }
};

module.exports = { enregistrer, rafraichir, supprimer, estValide };
