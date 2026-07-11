const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const rateLimit = require('express-rate-limit');
const path    = require('path');
require('dotenv').config();

// ── Vérifications de configuration au démarrage ──────────────────────────
// Mieux vaut refuser de démarrer qu'émettre des tokens non signés ou
// échouer en 500 obscurs sur chaque login.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('❌ JWT_SECRET manquant ou trop court (min. 32 caractères).');
  console.error('   Générez-en un : node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
  process.exit(1);
}

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

// Render/Heroku : derrière un proxy, nécessaire pour que le rate limiter
// identifie la vraie IP cliente via X-Forwarded-For.
app.set('trust proxy', 1);

app.use(helmet());

// ── CORS ──────────────────────────────────────────────────────────────────
// Les apps mobiles n'envoient pas d'en-tête Origin (non concernées par CORS).
// Seul le dashboard web est concerné : on n'autorise que les origines connues.
// Ajouter d'autres origines via ALLOWED_ORIGINS (séparées par des virgules).
const defaultOrigins = [
  'https://cenou-frontend.onrender.com',
  'http://localhost:3000',
  'http://localhost:5000',
  'http://localhost:8080',
];
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)
  .concat(defaultOrigins);

app.use(cors({
  origin: (origin, callback) => {
    // Requêtes sans Origin : apps mobiles, curl, health checks
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`Origine non autorisée par CORS: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 'Authorization', 'Accept',
    'Origin', 'X-Requested-With', 'x-platform',
  ],
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ── Rate limiting ─────────────────────────────────────────────────────────
// Protège login/register du brute force. Limite large sur le reste de l'API.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives. Réessayez dans 15 minutes.' },
});
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes. Réessayez dans une minute.' },
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api', apiLimiter);

if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
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
  console.log(`Origines CORS autorisées: ${allowedOrigins.join(', ')}`);

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

// ── Keepalive DB toutes les 4min30 ─────────────────────────────────────

function _startKeepalive(pool) {
  // Neon auto-suspend = 5 min → on ping toutes les 4min30
  // MAIS seulement entre 10h et 18h UTC pour économiser les CU-hrs la nuit
  const INTERVAL_MS = 4.5 * 60 * 1000;

  setInterval(async () => {
    const hour = new Date().getUTCHours();
    if (hour < 10 || hour >= 18) {
      console.log('🌙 Keepalive suspendu (nuit UTC) — Neon peut s\'endormir');
      return; // laisse Neon dormir la nuit
    }

    try {
      await Promise.race([
        pool.query('SELECT 1'),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('keepalive timeout')), 10_000)
        ),
      ]);
      console.log('💓 Keepalive DB OK');
    } catch (err) {
      console.log(`⚠️  Keepalive échoué (${err.message})`);
    }
  }, INTERVAL_MS);

  console.log('💓 Keepalive DB démarré (4min30, actif 10h-18h UTC)');
}

// ── Erreurs non gérées ────────────────────────────────────────────────────

process.on('unhandledRejection', (err) => {
  console.error('❌ Erreur non gérée:', err?.message || err);
});
process.on('uncaughtException', (err) => {
  console.error('❌ Exception non capturée:', err?.message || err);
});
