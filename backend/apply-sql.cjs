const { Client } = require('pg');
const fs = require('fs');

async function main() {
  const file = process.argv[2];
  if (!file) { console.error('usage: node apply-sql.cjs <file.sql>'); process.exit(2); }
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  try {
    const sql = fs.readFileSync(file, 'utf8');
    await client.query(sql);
    console.log('OK: applied', file);
  } catch (e) {
    console.error('ERR:', e.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error('CONNECT ERR:', e.message); process.exit(1); });