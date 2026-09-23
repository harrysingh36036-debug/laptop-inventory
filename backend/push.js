/**
 * push.js
 * Free self-hosted Web Push (VAPID) — no third-party service needed.
 *
 * Subscriptions are stored in the local SQLite file (inventory.db) in the
 * PushSubscriptions table, so they survive restarts. The browser push
 * services (Google/Mozilla/Apple) deliver the message — we only pay with our
 * own VPS resources ($0 extra).
 *
 * Env (backend/.env on the VPS):
 *   VAPID_PUBLIC_KEY=...
 *   VAPID_PRIVATE_KEY=...   (never commit this to git)
 *   VAPID_CONTACT=mailto:admin@universalcrm.in
 */

let webpush = null;
try {
  webpush = require('web-push');
} catch (err) {
  console.warn('[push] web-push not installed yet — push disabled until `npm install` runs:', err.message);
}

const { db } = require('./db');

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS PushSubscriptions (
      endpoint   TEXT PRIMARY KEY,
      p256dh     TEXT NOT NULL,
      auth       TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
} catch (err) {
  console.warn('[push] could not ensure PushSubscriptions table:', err.message);
}

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const CONTACT = process.env.VAPID_CONTACT || 'mailto:admin@universalcrm.in';

let vapidReady = false;
if (webpush && PUBLIC_KEY && PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(CONTACT, PUBLIC_KEY, PRIVATE_KEY);
    vapidReady = true;
    console.log('[push] VAPID configured — push enabled');
  } catch (err) {
    console.warn('[push] invalid VAPID keys — push disabled:', err.message);
  }
} else {
  console.warn('[push] VAPID keys missing — push disabled until VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY are set');
}

function getPublicKey() {
  return PUBLIC_KEY || null;
}

function saveSubscription(sub) {
  if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
    return { error: 'Invalid subscription' };
  }
  db.prepare(
    'INSERT INTO PushSubscriptions (endpoint, p256dh, auth) VALUES (?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth'
  ).run(sub.endpoint, sub.keys.p256dh, sub.keys.auth);
  return { ok: true };
}

function removeSubscription(endpoint) {
  if (!endpoint) return { error: 'endpoint is required' };
  db.prepare('DELETE FROM PushSubscriptions WHERE endpoint = ?').run(endpoint);
  return { ok: true };
}

function allSubscriptions() {
  try {
    return db.prepare('SELECT endpoint, p256dh, auth FROM PushSubscriptions').all();
  } catch {
    return [];
  }
}

// Fire-and-forget: never throws, removes dead (404/410) subscriptions.
async function sendPush(payload) {
  if (!vapidReady) return { sent: 0, skipped: 'vapid-not-configured' };
  const subs = allSubscriptions();
  if (!subs.length) return { sent: 0, skipped: 'no-subscriptions' };
  const body = JSON.stringify({
    title: payload.title || 'Universal CRM',
    body: payload.body || '',
    tag: payload.tag || 'laptop-inventory',
    url: payload.url || '/'
  });
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body);
        sent += 1;
      } catch (err) {
        if (err && (err.statusCode === 404 || err.statusCode === 410)) {
          try { removeSubscription(s.endpoint); } catch { /* ignore */ }
        }
      }
    })
  );
  return { sent };
}

module.exports = { getPublicKey, saveSubscription, removeSubscription, sendPush };
