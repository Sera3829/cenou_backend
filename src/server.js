const express = require('express');
const cors    = require('cors');
const path    = require('path');
require('dotenv').config();

const authRoutes         = require('./routes/auth');
const userRoutes         = require('./routes/users');
const paiementRoutes     = require('./routes/paiements');
const signalementRoutes  = require('./routes/signalements');
const annonceRoutes      = require('./routes/annonces');
const notificationRoutes = require('./routes/notifications');
const rapportRoutes      = require('./routes/rapports');
const adminRoutes        = require('./routes/admin');
const centreRoutes       = require('./routes/centreRoutes');

const db           = require('./config/database');
const errorHandler = require('./middlewares/errorHandler');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','Accept','Origin','X-Requested-With','x-platform'],
}));
app.options('*', cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
    const auth = req.headers['authorization'];
    console.log(`📤 Authorization Header: ${auth ? auth.substring(0, 30) + '...' : 'MANQUANT'}`);
    next();
  });
}

app.use('/api/auth',          authRoutes);
app.use('/api/users',         userRoutes);
app.use('/api/paiements',     paiementRoutes);
app.use('/api/signalements',  signalementRoutes);
app.use('/api/annonces',      annonceRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/rapports',      rapportRoutes);
app.use('/api/admin',         adminRoutes);
app.use('/api/centres',       centreRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

app.get('/', (req, res) => {
  res.json({ message: 'API CENOU Backend', version: '1.0.0' });
});

app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route non trouvée', path: req.originalUrl, method: req.method });
});

app.use(errorHandler);

// ── Démarrage ─────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log('Serveur CENOU Backend démarré');
  console.log(`Port: ${PORT}`);
  console.log(`Environnement: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Local: http://localhost:${PORT}`);
  console.log(`Réseau: https://cenou-backend.onrender.com`);
  console.log('CORS activé pour toutes les origines (*)');
  console.log('Routes disponibles:');
  console.log('   POST /api/auth/login');
  console.log('   POST /api/auth/register');
  console.log('   GET  /api/health');

  _checkDbOnStartup();
});

// ── Ping DIRECT (bypass du retry de database.js) ──────────────────────────
// Objectif : tenter de réveiller Neon sans le flooder
// Le retry applicatif reste dans database.js pour les vraies requêtes

async function _checkDbOnStartup() {
  console.log('⏳ Vérification connexion PostgreSQL…');
  const { pool } = require('./config/database');

  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      await pool.query('SELECT 1');
      console.log('✅ PostgreSQL connecté');

      // Keepalive toutes les 4 min pour éviter le sleep Neon
      setInterval(async () => {
        try { await pool.query('SELECT 1'); }
        catch (_) { console.log('⚠️  Keepalive DB échoué — retry auto sur prochaine requête'); }
      }, 4 * 60 * 1000);

      return;
    } catch (err) {
      const waitSec = attempt <= 3 ? 3 : 5;
      console.log(`⏳ DB non disponible (tentative ${attempt}/10) — retry dans ${waitSec}s`);
      console.log(`   Raison: ${err.message}`);

      if (attempt === 3) {
        console.log('');
        console.log('💡 Si ce message persiste, vérifie sur console.neon.tech :');
        console.log('   → Projet suspendu ? → bouton "Reactivate"');
        console.log('   → Compute hours gratuites épuisées ?');
        console.log('   → DATABASE_URL toujours valide ?');
        console.log('   Le serveur continue de fonctionner — redéploie après réactivation.');
        console.log('');
      }

      if (attempt < 10) await new Promise(r => setTimeout(r, waitSec * 1000));
      else {
        console.error('❌ PostgreSQL indisponible après 10 tentatives.');
        console.error('   → Vérifiez console.neon.tech et redéployez après réactivation.');
      }
    }
  }
}

process.on('unhandledRejection', (err) => {
  console.error('❌ Erreur non gérée:', err?.message || err);
});
process.on('uncaughtException', (err) => {
  console.error('❌ Exception non capturée:', err?.message || err);
});