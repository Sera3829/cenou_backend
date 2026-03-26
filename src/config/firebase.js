const admin = require('firebase-admin');
const path = require('path');
require('dotenv').config();

let firebaseInitialized = false;
let db = null;
let messaging = null;

// Vérifier si Firebase est activé
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

    // Vérifier que le fichier contient les bonnes données
    if (!serviceAccount.project_id || !serviceAccount.private_key || !serviceAccount.client_email) {
      throw new Error('Fichier firebase-service-account.json invalide ou incomplet');
    }

    console.log('🔑 Project ID Firebase:', serviceAccount.project_id);

    // Initialiser Firebase Admin SDK
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

    db = admin.firestore();
    messaging = admin.messaging();
    firebaseInitialized = true;

    console.log('✅ Firebase Admin initialisé avec succès');
    console.log(`📊 Firestore disponible pour le projet: ${serviceAccount.project_id}`);

    // Test de connexion Firestore
    testFirestoreConnection();

  } catch (error) {
    console.error('❌ Erreur initialisation Firebase:', error.message);
    console.error('📋 Détails:', {
      code: error.code,
      stack: error.stack?.split('\n')[0]
    });
    console.error('⚠️ Firebase désactivé - L\'application fonctionnera en mode dégradé');
  }
} else {
  console.log('⚠️ Firebase désactivé via configuration (.env)');
}

// Fonction de test de connexion Firestore
async function testFirestoreConnection() {
  if (!db) return;
  
  try {
    // Essayer d'accéder à Firestore
    await db.collection('_health_check').doc('test').set({
      timestamp: new Date().toISOString(),
      message: 'Firestore connection test'
    });
    
    console.log('✅ Firestore connecté et fonctionnel');
    
    // Nettoyer le document de test
    await db.collection('_health_check').doc('test').delete();
  } catch (error) {
    console.error('❌ Erreur test connexion Firestore:', error.message);
    console.error('💡 Vérifiez que Firestore Database est activé dans Firebase Console');
    firebaseInitialized = false;
  }
}

const isFirebaseAvailable = () => firebaseInitialized;

module.exports = {
  admin,
  db,
  messaging,
  isFirebaseAvailable,
};