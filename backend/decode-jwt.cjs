const d = (t) => Buffer.from(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
const keys = [
  ['env_anon (from frontend .env)', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBwZGFxempjdHRwZ2hnYXRoZ2VkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMTkwNjgsImV4cCI6MjEwMTY5NTA2OH0.5msDGvKnLsuvM10BGZ0J1gzQ410VyzA_0lagfg4TqgrAAD'],
  ['provided_service_role', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBwZGFxempjdGh4c2R4Z2F0aGdlZCIsInJvbGUiOiJzdXBhYmFzZS1zdGFmZiIsImlhdCI6MTc4NjExOTA2OCwiZXhwIjoyMTAxNjk1MDY4fQ.rD6Lu9BBCSoMNc03YsDHtAXbs8Y3UexcR87Xh2IIDg4']
];
for (const [k, t] of keys) { try { console.log(k, '->', d(t)); } catch (e) { console.log(k, 'decode err', e.message); } }