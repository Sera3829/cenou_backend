const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Import des routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const paiementRoutes = require('./routes/paiements');
const signalementRoutes = require('./routes/signalements');
const annonceRoutes = require('./routes/annonces');
const notificationRoutes = require('./routes/notifications');
const rapportRoutes = require('./routes/rapports');
const adminRoutes = require('./routes/admin');
const centreRoutes = require('./routes/centreRoutes');

// Connexion à la base de données PostgreSQL
const db = require('./config/database');

// Vérification de la connexion PostgreSQL
(async () => {
  try {
    const res = await db.query('SELECT NOW()');
    console.log('PostgreSQL connecté:', res.rows[0]);
  } catch (err) {
    console.error('Erreur connexion PostgreSQL:', err);
    process.exit(1); // stop serveur si DB morte
  }
})();

// Middleware de gestion des erreurs
const errorHandler = require('./middlewares/errorHandler');

// Initialisation de l'application Express
const app = express();
const PORT = process.env.PORT || 3000;

// ==================== CONFIGURATION CORS ====================

// Configuration CORS pour autoriser toutes les origines en développement
app.use(cors({
  origin: '*',                    // À restreindre en production
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With']
}));

// Gestion des requêtes preflight OPTIONS
app.options('*', cors());

// ==================== MIDDLEWARES ESSENTIELS ====================

// Parsing des requêtes JSON et URL-encodées
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir les fichiers statiques du dossier uploads
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Middleware de logging (à désactiver ou limiter en production)
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
    next();
  });
}

// ==================== ROUTES DE L'API ====================

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/paiements', paiementRoutes);
app.use('/api/signalements', signalementRoutes);
app.use('/api/annonces', annonceRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/rapports', rapportRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/centres', centreRoutes);

// ==================== ROUTES UTILITAIRES ====================

// Route de contrôle de santé (health check)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    message: 'Serveur CENOU Backend opérationnel'
  });
});

// Route racine
app.get('/', (req, res) => {
  res.json({
    message: 'API CENOU Backend',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      paiements: '/api/paiements',
      signalements: '/api/signalements',
      admin: '/api/admin'
    }
  });
});

// Gestion des routes non trouvées (404)
app.use('*', (req, res) => {
  console.log(`404: ${req.method} ${req.originalUrl}`);

  res.status(404).json({
    error: 'Route non trouvée',
    path: req.originalUrl,
    method: req.method,
    suggestion: 'Vérifiez la méthode HTTP (GET vs POST)',
    timestamp: new Date().toISOString()
  });
});

// ==================== GESTION DES ERREURS ====================

// Middleware de gestion des erreurs (doit être placé en dernier)
app.use(errorHandler);

// ==================== DÉMARRAGE DU SERVEUR ====================

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Serveur CENOU Backend démarré`);
  console.log(`Port: ${PORT}`);
  console.log(`Environnement: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Local: http://localhost:${PORT}`);
<<<<<<< HEAD
  console.log(`Réseau: https://cenou-backend.onrender.com:${PORT}`);
=======
  console.log(`Réseau: https://cenou-backend.onrender.com`);
>>>>>>> 09b263c453a70cb0af441ce6f59f051351cc3625
  console.log(`CORS activé pour toutes les origines (*)`);
  console.log(`Routes disponibles:`);
  console.log(`   POST /api/auth/login`);
  console.log(`   POST /api/auth/register`);
  console.log(`   GET  /api/health`);
});

// Gestion des rejets de promesse non capturés
process.on('unhandledRejection', (err) => {
  console.error('Erreur non gérée:', err);
  process.exit(1);
});
