const fs = require('fs');
const path = require('path');
const db = require('./client');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function runMigrations() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  const appliedResult = await db.query('SELECT version FROM schema_migrations');
  const appliedVersions = new Set(appliedResult.rows.map((row) => row.version));

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (appliedVersions.has(file)) {
      continue;
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    console.log(`Running migration: ${file}`);

    await db.query(sql);
    await db.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);

    console.log(`Migration applied: ${file}`);
  }
}

module.exports = { runMigrations };
