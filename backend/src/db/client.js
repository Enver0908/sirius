const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set. Exiting.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,                    // Max connections in pool
  idleTimeoutMillis: 30000,   // Close idle clients after 30s
  connectionTimeoutMillis: 5000,
});

// ── Connection lifecycle logging ──────────────────────────────
pool.on('connect', () => {
  console.log('🟢 New PostgreSQL client connected');
});

pool.on('error', (err) => {
  console.error('🔴 Unexpected PostgreSQL pool error:', err.message);
  // Don't crash — the pool will attempt to reconnect
});

// ── Health check ──────────────────────────────────────────────
async function testConnection() {
  let client;
  try {
    client = await pool.connect();
    const result = await client.query('SELECT NOW() AS server_time');
    console.log(`✅ PostgreSQL connected — server time: ${result.rows[0].server_time}`);
    return true;
  } catch (err) {
    console.error('❌ PostgreSQL connection failed:', err.message);
    return false;
  } finally {
    if (client) client.release();
  }
}

// ── Query helper ──────────────────────────────────────────────
// Wraps pool.query with consistent error handling
async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 2000) {
      console.warn(`⚠️  Slow query (${duration}ms):`, text.substring(0, 120));
    }
    return result;
  } catch (err) {
    console.error('❌ Query error:', err.message);
    console.error('   Query:', text.substring(0, 200));
    throw err;
  }
}

// ── Transaction helper ────────────────────────────────────────
// Usage: await db.transaction(async (client) => { ... })
async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Graceful shutdown ─────────────────────────────────────────
async function close() {
  console.log('🔌 Closing PostgreSQL pool...');
  await pool.end();
  console.log('✅ PostgreSQL pool closed');
}

module.exports = {
  pool,
  query,
  transaction,
  testConnection,
  close,
};
