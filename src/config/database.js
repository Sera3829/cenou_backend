const { Pool } = require('pg');
require('dotenv').config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not defined');
}

console.log('Connecting to PostgreSQL via DATABASE_URL');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },

  // Neon serverless : max 5 connexions simultanées
  max: 5,
  min: 0,
  idleTimeoutMillis: 10000,

  // Timeouts généreux pour le cold start Neon (~3-8s)
  connectionTimeoutMillis: 10000,
  query_timeout: 30000,
});

pool.on('connect', () => {
  console.log('PostgreSQL connection established');
});

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err.message);
});

// ── Helpers ────────────────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // ms

const isRetryableError = (err) =>
  err.message?.includes('timeout') ||
  err.message?.includes('Connection terminated') ||
  err.message?.includes('ECONNRESET') ||
  err.code === 'ECONNRESET' ||
  err.code === 'ETIMEDOUT' ||
  err.code === '57P01'; // admin_shutdown (Neon suspend)

// ── query avec retry automatique ──────────────────────────────────────────

const query = async (text, params, attempt = 1) => {
  const start = Date.now();
  try {
    const res      = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Query executed:', { text: text.substring(0, 80), duration, rows: res.rowCount });
    return res;
  } catch (err) {
    if (isRetryableError(err) && attempt < MAX_RETRIES) {
      console.log(`🔄 DB timeout — tentative ${attempt}/${MAX_RETRIES}, retry dans ${RETRY_DELAY}ms…`);
      await new Promise(r => setTimeout(r, RETRY_DELAY));
      return query(text, params, attempt + 1);
    }
    console.error('PostgreSQL query error:', err);
    throw err;
  }
};

// ── getClient avec retry ───────────────────────────────────────────────────

const getClient = async (attempt = 1) => {
  try {
    const client = await pool.connect();

    const originalQuery   = client.query.bind(client);
    const originalRelease = client.release.bind(client);

    client.query   = (...args) => originalQuery(...args);
    client.release = ()       => originalRelease();

    return client;
  } catch (err) {
    if (isRetryableError(err) && attempt < MAX_RETRIES) {
      console.log(`🔄 getClient timeout — tentative ${attempt}/${MAX_RETRIES}…`);
      await new Promise(r => setTimeout(r, RETRY_DELAY));
      return getClient(attempt + 1);
    }
    throw err;
  }
};

module.exports = { query, getClient, pool };