import { getToken } from './api';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.json();
}

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;

export async function getServerPublicKey() {
  if (import.meta.env.VITE_VAPID_PUBLIC_KEY) return import.meta.env.VITE_VAPID_PUBLIC_KEY;
  const { publicKey } = await api('/api/push/vapid-public-key');
  return publicKey || null;
}

export async function getPushState() {
  if (!pushSupported()) return { supported: false, permission: 'unsupported', subscribed: false };
  const permission = Notification.permission;
  const reg = await navigator.serviceWorker.ready.catch(() => null);
  const sub = await reg?.pushManager.getSubscription().catch(() => null);
  return { supported: true, permission, subscribed: !!sub };
}

export async function enablePush() {
  if (!pushSupported()) throw new Error('Push not supported on this device/browser');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notification permission was not granted');
  const publicKey = await getServerPublicKey();
  if (!publicKey) throw new Error('Push not configured on server yet (missing VAPID key)');
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey)
  });
  await api('/api/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON() } });
  return true;
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.ready.catch(() => null);
  const sub = await reg?.pushManager.getSubscription().catch(() => null);
  if (sub) {
    try {
      await api('/api/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } });
    } catch { /* still unsubscribe locally */ }
    await sub.unsubscribe().catch(() => {});
  }
  return true;
}
