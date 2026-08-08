const fs = require('fs');
const path = require('path');
const { Client } = require(path.resolve(__dirname, '..', 'backend', 'node_modules', 'pg'));

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
}
const vars = readJson(process.env.OCIVARS || path.join(process.env.TEMP, 'ocivars.json'));
const url = vars.SUPABASE_DATABASE_URL || vars.DATABASE_URL;
const sqlFile = process.argv[2];
const sql = fs.readFileSync(sqlFile, 'utf8');

(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('connected ok');
  const started = Date.now();
  // Split on section-divider comment lines so failures can be located.
  const chunks = sql.split(/\n--\s*-{3,}\n/).filter((c) => c.trim());
  let done = 0;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i].trim();
    const label = (chunk.match(/^-- (.+)$/m) || [])[1] || `chunk ${i + 1}`;
    try {
      await client.query(chunk);
      done++;
      console.log(`ok [${label}]`);
    } catch (e) {
      console.error(`FAIL [${label}]: ${e.message}`);
      console.error(chunk.slice(0, 400));
    }
  }
  console.log(`applied ${done}/${chunks.length} chunks in ${Date.now() - started}ms`);
  await client.end();
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});