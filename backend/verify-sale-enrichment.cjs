const fs = require('fs');
const vars = JSON.parse(fs.readFileSync(process.env.TEMP + '\\ocivars.json', 'utf8').replace(/^\uFEFF/, ''));
const BASE = vars.VITE_SUPABASE_URL;
const KEY = vars.VITE_SUPABASE_ANON_KEY;
const pass = JSON.parse(fs.readFileSync(process.env.TEMP + '\\newpass.json', 'utf8')).superadmin;

const https = require('https');
function post(path, token, body) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body || {});
    const headers = { apikey: KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const req = https.request(`${BASE}/rest/v1/${path}`, { method: 'POST', headers }, (r) => {
      let b = ''; r.on('data', (c) => b += c); r.on('end', () => { try { resolve({ status: r.statusCode, body: JSON.parse(b) }) } catch (e) { resolve({ status: r.statusCode, body: b }) } });
    });
    req.on('error', (e) => resolve({ status: 0, body: e.message }));
    req.write(data); req.end();
  });
}

(async () => {
  // login
  const login = await new Promise((resolve) => {
    const data = JSON.stringify({ email: 'superadmin@laptop.inventory', password: pass });
    const req = https.request(`${BASE}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' } }, (r) => {
      let b=''; r.on('data',c=>b+=c); r.on('end',()=>{let p=null;try{p=JSON.parse(b)}catch{/*raw*/};resolve({status:r.statusCode, body:b, parsed:p})});
    });
    req.on('error',(e)=>resolve({status:0,body:e.message}));
    req.write(data); req.end();
  });
  if (login.status !== 200) { console.log('login fail', login); return; }
  const tok = login.parsed?.access_token;
  const lts = await post('rpc/app_get_laptops', tok, {});
  const arr = lts.body;
  const sold = arr.filter((l) => l.status === 'Sold');
  console.log('total:', arr.length, 'sold:', sold.length);
  (sold || []).forEach((s) => console.log(JSON.stringify({ id: s.id, serial: s.serial_number, status: s.status, sale_customer_name: s.sale_customer_name, sale_price: s.sale_price, sold_at: s.sold_at, sold_by: s.sold_by })));
  console.log('enrichment field present:', sold.some((s) => Object.prototype.hasOwnProperty.call(s, 'sale_customer_name')));
})();
