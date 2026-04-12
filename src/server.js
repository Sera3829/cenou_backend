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
const logementRoutes     = require('./routes/logementRoutes');

const db           = require('./config/database');
const errorHandler = require('./middlewares/errorHandler');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 'Authorization', 'Accept',
    'Origin', 'X-Requested-With', 'x-platform',
  ],
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
app.use('/api/logements',     logementRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.get('/', (req, res) => {
  res.json({ message: 'API CENOU Backend', version: '1.0.0' });
});

app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route non trouvée',
    path: req.originalUrl,
    method: req.method,
  });
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

// ── Ping startup avec timeout explicite ───────────────────────────────────
// Neon cold start = jusqu'à 20s. On tente 15 fois avec backoff progressif
// pour absorber un réveil lent sans flooder la connexion.

async function _checkDbOnStartup() {
  console.log('⏳ Vérification connexion PostgreSQL…');
  const { pool } = require('./config/database');

  const MAX   = 15;
  let success = false;

  for (let attempt = 1; attempt <= MAX; attempt++) {
    try {
      // Timeout explicite sur le ping : si Neon ne répond pas en 25s
      // on passe à la tentative suivante plutôt que d'attendre indefiniment.
      await Promise.race([
        pool.query('SELECT 1'),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('ping timeout')), 25_000)
        ),
      ]);

      console.log('✅ PostgreSQL connecté');
      success = true;
      _startKeepalive(pool);
      return;

    } catch (err) {
      // Backoff progressif : 3s pour les 3 premières tentatives, 6s ensuite
      const waitSec = attempt <= 3 ? 3 : 6;
      console.log(`⏳ DB non disponible (tentative ${attempt}/${MAX}) — retry dans ${waitSec}s`);
      console.log(`   Raison: ${err.message}`);

      if (attempt === 3) {
        console.log('');
        console.log('💡 Neon en cours de réveil (cold start ~10-20s). Patientez…');
        console.log('   Si ça persiste > 2 min → vérifiez console.neon.tech');
        console.log('');
      }

      if (attempt < MAX) {
        await new Promise(r => setTimeout(r, waitSec * 1000));
      }
    }
  }

  if (!success) {
    console.error('❌ PostgreSQL indisponible après toutes les tentatives.');
    console.error('   → Vérifiez console.neon.tech (projet suspendu ?) et redéployez.');
    // On ne crash pas le process — les requêtes API retenteront via database.js
  }
}

// ── Keepalive DB toutes les 3 minutes ─────────────────────────────────────
// Neon auto-suspend = 5 min → on ping toutes les 3 min pour rester sous le seuil.
// Note : ce keepalive ne fonctionne QUE si Render est lui-même éveillé.
// Pour maintenir Render éveillé → configurez UptimeRobot (gratuit) :
//   https://uptimerobot.com → monitor HTTP → https://cenou-backend.onrender.com/api/health → 5 min

function _startKeepalive(pool) {
  const INTERVAL_MS = 3 * 60 * 1000; // 3 minutes

  setInterval(async () => {
    try {
      await Promise.race([
        pool.query('SELECT 1'),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('keepalive timeout')), 10_000)
        ),
      ]);
      console.log('💓 Keepalive DB OK');
    } catch (err) {
      // Ne pas crasher — la prochaine requête API relancera la connexion via retry
      console.log(`⚠️  Keepalive DB échoué (${err.message}) — Neon s'est rendormi`);
      console.log('   La prochaine requête API le réveillera automatiquement.');
    }
  }, INTERVAL_MS);

  console.log(`💓 Keepalive DB démarré (toutes les ${INTERVAL_MS / 60000} min)`);
}

// ── Erreurs non gérées ────────────────────────────────────────────────────

process.on('unhandledRejection', (err) => {
  console.error('❌ Erreur non gérée:', err?.message || err);
});
process.on('uncaughtException', (err) => {
  console.error('❌ Exception non capturée:', err?.message || err);
});