const fs = require('fs');
const t = fs.readFileSync('C:/Users/Admin/Documents/Default Project/laptop-inventory/frontend/.env', 'utf8');
const url = (t.match(/VITE_SUPABASE_URL=(\S+)/) || [])[1];
const anon = (t.match(/VITE_SUPABASE_ANON_KEY=(\S+)/) || [])[1];

const d = (k) => { try { return Buffer.from(k.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'); } catch (e) { return 'decode err ' + e.message; } };
console.log('project url :', url);
console.log('env anon ref:', d(anon));
console.log('--- live REST check with .env anon key ---');
fetch(url + '/rest/v1/stores?select=id,store_name&limit=3', { headers: { apikey: anon, Authorization: 'Bearer ' + anon } })
  .then(async (r) => {
    console.log('status:', r.status);
    console.log('body:', (await r.text()).slice(0, 300));
  })
  .catch((e) => console.log('net err', e.message));