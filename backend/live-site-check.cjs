const https = require('https');
https.get('https://harrysingh36036-debug.github.io/laptop-inventory/', { headers: { 'User-Agent': 'node' } }, (r) => {
  let b = '';
  r.on('data', (c) => b += c);
  r.on('end', () => {
    console.log('HTTP', r.statusCode, 'len', b.length);
    console.log('title present:', b.includes('Laptop Inventory'));
  });
}).on('error', (e) => console.log('ERR', e.message));
