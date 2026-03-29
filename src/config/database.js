const { Pool } = require('pg');
require('dotenv').config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not defined');
}

let pool;

// On utilise directement process.env.DATABASE_URL
if (process.env.DATABASE_URL) {
  console.log('Connecting to PostgreSQL via DATABASE_URL');
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false,
    },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });
} else {
  console.log('Connecting to PostgreSQL via individual variables');
  pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });
}

// Connection event handler
pool.on('connect', () => {
  console.log('PostgreSQL connection established');
});

// Error event handler (pool will attempt to reconnect automatically)
pool.on('error', (err) => {
  console.error('PostgreSQL error:', err);
});

/**
 * Execute a SQL query with optional parameters.
 * Logs execution time and result row count.
 *
 * @param {string} text - SQL query string
 * @param {Array} [params] - Query parameters
 * @returns {Promise<object>} Query result object
 */
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Query executed:', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('PostgreSQL query error:', error);
    throw error;
  }
};

/**
 * Acquire a client from the pool for transaction handling.
 * The returned client has its own query method and a release method.
 *
 * @returns {Promise<object>} A client with query and release methods
 */
const getClient = async () => {
  const client = await pool.connect();
  const query = client.query.bind(client);
  const release = client.release.bind(client);

  // Wrap the client's query method to preserve transaction context
  client.query = (...args) => {
    return query(...args);
  };

  client.release = () => {
    return release();
  };

  return client;
};

module.exports = {
  query,
  getClient,
  pool,
};
