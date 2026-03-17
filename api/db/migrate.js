require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getRootConnection } = require('../src/config/db');

async function migrate() {
  const conn = await getRootConnection();
  try {
    const publicDb = process.env.DB_PUBLIC || 'iis_public';
    console.log(`[migrate] Ensuring database "${publicDb}" exists...`);
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${publicDb}\``);
    await conn.query(`USE \`${publicDb}\``);

    const sqlPath = path.join(__dirname, 'migrations', '001_public_schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    const statements = sql.split(';').map(s => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      await conn.query(stmt);
    }
    console.log('[migrate] Public schema ready.');
  } catch (err) {
    console.error('[migrate] Error:', err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

migrate();
