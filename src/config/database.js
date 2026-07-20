const { Pool } = require('pg');
require('dotenv').config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not defined');
}

console.log('Connecting to PostgreSQL via DATABASE_URL');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 6,                        // le dashboard tire ~4 requêtes en parallèle
  min: 0,                        // 0 la nuit → Neon peut s'endormir (pas de connexion maintenue)
  // 65s > l'intervalle de sondage (45s) : pendant l'usage actif la connexion
  // reste au chaud (plus de « connection established » à chaque requête) ;
  // après 65s sans activité elle se ferme et Neon peut dormir.
  idleTimeoutMillis: 65000,
  connectionTimeoutMillis: 35000,// 35s — Neon cold start jusqu'à 30s
  query_timeout: 60000,
});

pool.on('connect', () => console.log('PostgreSQL connection established'));
pool.on('error',   (err) => console.error('PostgreSQL pool error:', err.message));

const MAX_RETRIES = 4;           // 4 tentatives
const RETRY_DELAY = 5000;        // 5s entre chaque retry (Neon a le temps de se réveiller)

const isRetryable = (err) =>
  err.message?.includes('timeout')                        ||
  err.message?.includes('Connection terminated')          ||
  err.message?.includes('ECONNRESET')                     ||
  err.message?.includes('connect ETIMEDOUT')              ||
  err.message?.includes('the database system is starting up') ||
  err.message?.includes('endpoint is disabled')           || // ← Neon suspend
  err.message?.includes('Control plane request failed')   || // ← Neon réveil
  err.code === 'ECONNRESET' ||
  err.code === 'ETIMEDOUT'  ||
  err.code === '57P01'      ||
  err.code === '08006'      ||
  err.code === '08001';

const query = async (text, params, attempt = 1) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    if (process.env.NODE_ENV !== 'production') {
      console.log('Query executed:', {
        text: text.substring(0, 80),
        duration: Date.now() - start,
        rows: res.rowCount,
      });
    }
    return res;
  } catch (err) {
    if (isRetryable(err) && attempt <= MAX_RETRIES) {
      // Attente fixe de 8s — Neon a besoin d'un délai stable, pas progressif
      const wait = 8000;
      console.log(`🔄 Neon réveil en cours — tentative ${attempt}/${MAX_RETRIES} dans ${wait/1000}s… (${err.message})`);
      await new Promise(r => setTimeout(r, wait));
      return query(text, params, attempt + 1);
    }
    console.error('PostgreSQL query error:', err.message);
    throw err;
  }
};

const getClient = async (attempt = 1) => {
  try {
    const client          = await pool.connect();
    const originalQuery   = client.query.bind(client);
    const originalRelease = client.release.bind(client);
    client.query   = (...args) => originalQuery(...args);
    client.release = ()       => originalRelease();
    return client;
  } catch (err) {
    if (isRetryable(err) && attempt < MAX_RETRIES) {
      const wait = RETRY_DELAY * attempt;
      console.log(`🔄 getClient indisponible — tentative ${attempt}/${MAX_RETRIES}, retry dans ${wait / 1000}s…`);
      await new Promise(r => setTimeout(r, wait));
      return getClient(attempt + 1);
    }
    throw err;
  }
};

module.exports = { query, getClient, pool };