const { Pool } = require('pg');
require('dotenv').config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not defined');
}

console.log('Connecting to PostgreSQL via DATABASE_URL');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  min: 0,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000, // 30s — Neon cold start peut aller jusqu'à 20s
  query_timeout: 60000,           // 60s pour les grosses requêtes
});

pool.on('connect', () => console.log('PostgreSQL connection established'));
pool.on('error',   (err) => console.error('PostgreSQL pool error:', err.message));

const MAX_RETRIES = 5;           // 5 tentatives au lieu de 3
const RETRY_DELAY = 5000;        // 5s entre chaque retry (Neon a le temps de se réveiller)

const isRetryable = (err) =>
  err.message?.includes('timeout')               ||
  err.message?.includes('Connection terminated') ||
  err.message?.includes('ECONNRESET')            ||
  err.message?.includes('connect ETIMEDOUT')     ||
  err.message?.includes('the database system is starting up') ||
  err.code === 'ECONNRESET' ||
  err.code === 'ETIMEDOUT'  ||
  err.code === '57P01'      ||   // admin_shutdown
  err.code === '08006'      ||   // connection_failure
  err.code === '08001';          // sqlclient_unable_to_establish_sqlconnection

const query = async (text, params, attempt = 1) => {
  const start = Date.now();
  try {
    const res      = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Query executed:', {
      text: text.substring(0, 80),
      duration,
      rows: res.rowCount,
    });
    return res;
  } catch (err) {
    if (isRetryable(err) && attempt < MAX_RETRIES) {
      const wait = RETRY_DELAY * attempt; // backoff progressif : 5s, 10s, 15s…
      console.log(`🔄 DB indisponible — tentative ${attempt}/${MAX_RETRIES}, retry dans ${wait / 1000}s… (${err.message})`);
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