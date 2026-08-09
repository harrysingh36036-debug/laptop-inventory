const fs = require('fs');
const http = require('https');
const vars = JSON.parse(fs.readFileSync(process.env.TEMP + '\\ocivars.json', 'utf8').replace(/^\uFEFF/, ''));
const BASE = vars.VITE_SUPABASE_URL;
const KEY = vars.VITE_SUPABASE_ANON_KEY;
const pass = JSON.parse(fs.readFileSync(process.env.TEMP + '\\newpass.json', 'utf8')).superadmin;

function req(path, method, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : 'null';
    const headers = { apikey: KEY, Authorization: `Bearer ${token || KEY}`, 'Content-Type': 'application/json' };
    const r = http.request(BASE.replace('https://', ''), { path, method, headers }, (res) => {
      let b = '';
      res.on('data', (c) => b += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(b) }) } catch (e) { resolve({ status: res.statusCode, body: b }) } });
    });
    r.on('error', reject);
    r.write(data); r.end();
  });
}

let token;
(async () => {
  try {
    // login
    const authBase = vars.VITE_SUPABASE_URL.replace('https://', '');
    const login = await new Promise((resolve, reject) => {
      const data = JSON.stringify({ email: 'superadmin@laptop.inventory', password: pass });
      const r = http.request(authBase.replace('supabase.co', 'supabase.co'), { hostname: 'ppdaqzjcttpdpxgathged.supabase.co', path: '/auth/v1/token?grant_type=password', method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' } }, (res) => {
        let b=''; res.on('data', c=>b+=c); res.on('end', ()=>resolve({status:res.statusCode, body:b}));
      });
      r.on('error', reject); r.write(data); r.end();
    });
    if (login.status !== 200) throw new Error('login ' + login.status);
    token = JSON.parse(login.body).access_token;

    const sql = fs.readFileSync('patch-laptop-sale.cjs.tmp', 'utf8');
    const r = await req('/rest/v1/rpc/exec', 'POST', { query: sql });
    console.log('exec:', r.status, JSON.stringify(r.body).slice(0, 200));

    // verify enrichment on laptops list
    const lts = await req('/rest/v1/rpc/app_get_laptops', 'POST', {});
    const arr = lts.status === 200 ? JSON.parse(lts.body) : [];
    const sold = arr.filter(l => l.status === 'Sold');
    console.log('total laptops:', arr.length, 'sold:', sold.length);
    if (sold[0]) console.log('sample sold row:', JSON.stringify(sold[0]));
    const hasCustomerField = sold.some(s => Object.prototype.hasOwnProperty.call(s, 'sale_customer_name'));
    console.log('sold rows carry sale_customer_name:', hasCustomerField);
  } catch (e) {
    console.error('FATAL', e.message);
  }
})();
