const d = (t) => Buffer.from(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
const token = process.env.JWT_TOKEN || process.argv[2];
if (!token) {
  console.log('Usage: node decode-jwt.cjs <JWT_TOKEN> or set JWT_TOKEN env var');
  process.exit(1);
}
try {
  console.log('Decoded Payload ->', d(token));
} catch (e) {
  console.log('Decode error:', e.message);
}