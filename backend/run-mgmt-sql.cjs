const fs = require('fs');

const TOKEN = process.env.SUPABASE_TOKEN;
const REF = process.env.PROJECT_REF;

async function main() {
  const file = process.argv[2];
  const sql = fs.readFileSync(file, 'utf8');
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: sql })
  });
  const text = await res.text();
  if (!res.ok) {
    console.error('ERR HTTP', res.status, ':', text.slice(0, 2000));
    process.exitCode = 1;
  } else {
    console.log('OK:', file);
    if (text && text !== '[]') console.log(text.slice(0, 1000));
  }
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });