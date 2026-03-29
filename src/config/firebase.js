const admin = require('firebase-admin');
require('dotenv').config();

let firebaseInitialized = false;
let db = null;
let messaging = null;

const firebaseEnabled = process.env.FIREBASE_ENABLED !== 'false';

if (firebaseEnabled) {
  try {
<<<<<<< HEAD
    // Charger le fichier de clé de service
  let serviceAccount;

  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.log('🔐 Firebase via variable d’environnement');
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } else {
    console.log('📂 Firebase via fichier local');
    const serviceAccountPath = path.resolve(__dirname, './firebase-service-account.json');
    serviceAccount = require(serviceAccountPath);
  }
=======
    let serviceAccount;

    // ✅ Sur Render : utiliser la variable d'environnement
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      console.log('🔑 Chargement Firebase depuis FIREBASE_SERVICE_ACCOUNT');
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } else {
      // ✅ En local : utiliser le fichier
      const path = require('path');
      const serviceAccountPath = path.resolve(__dirname, '../../config/firebase-service-account.json');
      console.log('📂 Chargement Firebase depuis fichier:', serviceAccountPath);
      serviceAccount = require(serviceAccountPath);
    }
>>>>>>> 09b263c453a70cb0af441ce6f59f051351cc3625

    if (!serviceAccount.project_id || !serviceAccount.private_key || !serviceAccount.client_email) {
      throw new Error('Credentials Firebase invalides ou incomplets');
    }

    console.log('🔑 Project ID Firebase:', serviceAccount.project_id);

<<<<<<< HEAD
    // Initialiser Firebase Admin SDK
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
=======
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });
>>>>>>> 09b263c453a70cb0af441ce6f59f051351cc3625

    db = admin.firestore();
    messaging = admin.messaging();
    firebaseInitialized = true;

    console.log('✅ Firebase Admin initialisé avec succès');

    testFirestoreConnection();

  } catch (error) {
    console.error('❌ Erreur initialisation Firebase:', error.message);
    console.error('⚠️ Firebase désactivé - mode dégradé');
  }
} else {
  console.log('⚠️ Firebase désactivé via configuration');
}

async function testFirestoreConnection() {
  if (!db) return;
  try {
    await db.collection('_health_check').doc('test').set({
      timestamp: new Date().toISOString(),
    });
    console.log('✅ Firestore connecté et fonctionnel');
    await db.collection('_health_check').doc('test').delete();
  } catch (error) {
    console.error('❌ Erreur Firestore:', error.message);
    firebaseInitialized = false;
  }
}

const isFirebaseAvailable = () => firebaseInitialized;

module.exports = { admin, db, messaging, isFirebaseAvailable };
