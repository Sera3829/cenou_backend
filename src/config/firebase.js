const admin = require('firebase-admin');
require('dotenv').config();

let firebaseInitialized = false;
let db = null;
let messaging = null;

const firebaseEnabled = process.env.FIREBASE_ENABLED !== 'false';

if (firebaseEnabled) {
  try {
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

    if (!serviceAccount.project_id || !serviceAccount.private_key || !serviceAccount.client_email) {
      throw new Error('Credentials Firebase invalides ou incomplets');
    }

    console.log('🔑 Project ID Firebase:', serviceAccount.project_id);

    // Initialiser Firebase Admin SDK
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

    db = admin.firestore();
    messaging = admin.messaging();
    firebaseInitialized = true;


    testFirestoreConnection();

  } catch (error) {

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
}}
