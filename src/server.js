const express = require('express');
const cors    = require('cors');
const path    = require('path');
require('dotenv').config();

// Import des routes
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

// ── CORS ──────────────────────────────────────────────────────────────────

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

// ── Middlewares ───────────────────────────────────────────────────────────

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);

    // Log du header Authorization (masqué pour la sécurité)
    const auth = req.headers['authorization'];
    if (auth) {
      console.log(`📤 Authorization Header: ${auth.substring(0, 30)}...`);
    } else {
      console.log('📤 Authorization Header: MANQUANT');
    }
    next();
  });
}

// ── Routes ────────────────────────────────────────────────────────────────

app.use('/api/auth',          authRoutes);
app.use('/api/users',         userRoutes);
app.use('/api/paiements',     paiementRoutes);
app.use('/api/signalements',  signalementRoutes);
app.use('/api/annonces',      annonceRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/rapports',      rapportRoutes);
app.use('/api/admin',         adminRoutes);
app.use('/api/centres',       centreRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status:    'OK',
    timestamp: new Date().toISOString(),
    uptime:    process.uptime(),
    message:   'Serveur CENOU Backend opérationnel',
  });
});

app.get('/', (req, res) => {
  res.json({
    message:  'API CENOU Backend',
    version:  '1.0.0',
    endpoints: {
      auth:          '/api/auth',
      users:         '/api/users',
      paiements:     '/api/paiements',
      signalements:  '/api/signalements',
      admin:         '/api/admin',
    },
  });
});

// 404
app.use('*', (req, res) => {
  console.log(`404: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    error:      'Route non trouvée',
    path:       req.originalUrl,
    method:     req.method,
    suggestion: 'Vérifiez la méthode HTTP (GET vs POST)',
    timestamp:  new Date().toISOString(),
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

  // ── Vérification DB non-bloquante (ne stoppe plus le serveur) ───────────
  (async () => {
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        await db.query('SELECT 1');
        console.log('✅ PostgreSQL connecté');
        break;
      } catch (err) {
        console.log(`⏳ PostgreSQL non disponible (tentative ${attempt}/5)… ${err.message}`);
        if (attempt < 5) {
          await new Promise(r => setTimeout(r, 3000));
        } else {
          // On log l'erreur mais on NE fait PAS process.exit(1)
          // Le retry dans database.js prendra le relais sur les vraies requêtes
          console.error('⚠️  PostgreSQL indisponible au démarrage — les requêtes réessaieront automatiquement');
        }
      }
    }
  })();

  // ── Keepalive Neon : ping toutes les 4 min pour éviter la mise en veille ─
  setInterval(async () => {
    try {
      await db.query('SELECT 1');
      console.log('🔁 Keepalive DB OK');
    } catch (err) {
      console.log('⚠️  Keepalive DB échoué (retry automatique sur prochaine requête)');
    }
  }, 4 * 60 * 1000); // 4 minutes
});

// ── Gestion des erreurs non capturées ────────────────────────────────────

process.on('unhandledRejection', (err) => {
  console.error('❌ Erreur non gérée:', err.message || err);
  // Ne pas faire process.exit(1) pour laisser le serveur vivant
});

process.on('uncaughtException', (err) => {
  console.error('❌ Exception non capturée:', err.message || err);
  // Idem : on log sans tuer le process sauf erreur critique
});