const admin = require('firebase-admin');
const path = require('path');
require('dotenv').config();

let firebaseInitialized = false;
let db = null;
let messaging = null;

const firebaseEnabled = process.env.FIREBASE_ENABLED !== 'false';

if (firebaseEnabled) {
  try {
    let serviceAccount;

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      console.log('🔐 Firebase via variable d\'environnement');
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } else {
      console.log('📂 Firebase via fichier local');
      const serviceAccountPath = path.resolve(__dirname, './firebase-service-account.json');
      serviceAccount = require(serviceAccountPath);
    }

    if (!serviceAccount.project_id || !serviceAccount.private_key || !serviceAccount.client_email) {
      throw new Error('Credentials Firebase invalides ou incomplets');
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    db = admin.firestore();
    messaging = admin.messaging();
    firebaseInitialized = true;
    console.log('✅ Firebase initialisé (projet:', serviceAccount.project_id + ')');
  } catch (error) {
    console.error('❌ Initialisation Firebase échouée:', error.message);
    console.error('   → Les fonctionnalités Firebase (sessions, notifications) sont désactivées.');
    firebaseInitialized = false;
    db = null;
    messaging = null;
  }
} else {
  console.log('ℹ️ Firebase désactivé (FIREBASE_ENABLED=false)');
}

const isFirebaseAvailable = () => firebaseInitialized;

module.exports = { admin, db, messaging, isFirebaseAvailable };
