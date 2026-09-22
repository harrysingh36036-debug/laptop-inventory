import { io } from 'socket.io-client';
import { getToken } from './api';

// Live socket.io connection to the self-hosted Node backend (no Supabase).
// Same-origin `/socket.io` works in dev (Vite proxy) and in production
// (Nginx proxies /socket.io to the Node backend). Auto-reconnects, so every
// device updates instantly with no manual refresh.

let token = null;
try {
  token = getToken();
} catch {
  /* ignore */
}

const client = io({
  autoConnect: false,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 10000,
  auth: token ? { token } : {}
});

// Keep the same surface App.jsx already uses.
export const socket = {
  on: (event, cb) => client.on(event, cb),
  off: (event, cb) => {
    if (cb) client.off(event, cb);
    else client.removeAllListeners(event);
  },
  emit: (event, ...args) => client.emit(event, ...args),
  connect() {
    const t = getToken();
    client.auth = t ? { token: t } : {};
    if (!client.connected) client.connect();
  },
  disconnect() {
    client.disconnect();
  },
  auth: {}
};

export function setSocketAuth(t) {
  token = t || null;
  client.auth = token ? { token } : {};
}

// Compat no-ops: PII is now gated by UI permissions (showSensitive), and the
// server authenticates the handshake from the stored JWT.
export function setLocalRole() {}
export function setLocalPII() {}
