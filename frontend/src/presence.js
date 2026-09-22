import { socket } from './socket';

// Live presence for "who is currently logged in / active now".
// The Node backend tracks authenticated sockets and broadcasts
// `presence:update` with { [userId]: [{ user_id, username, ... }] }.
// Same API the Accounts tab already uses.

let currentPresenceState = {};
const listeners = new Set();

function emit() {
  for (const cb of [...listeners]) {
    try { cb(currentPresenceState); } catch { /* isolated */ }
  }
}

socket.on('presence:update', (state) => {
  currentPresenceState = state || {};
  emit();
});

export function getPresenceState() {
  return currentPresenceState;
}

export function onPresenceChange(cb) {
  listeners.add(cb);
  // immediate fire with current snapshot
  try { cb(currentPresenceState); } catch { /* */ }
  // pull a fresh snapshot in case we connected before subscribing
  try {
    socket.emit('presence:get', (state) => {
      if (state) {
        currentPresenceState = state;
        emit();
      }
    });
  } catch { /* ignore */ }
  return () => listeners.delete(cb);
}

/**
 * Join presence as `user`. The server tracks the socket itself once
 * connected, so this only ensures the connection is up.
 */
export async function joinPresence() {
  try {
    socket.connect();
  } catch { /* ignore */ }
}

export async function leavePresence() {
  currentPresenceState = {};
  emit();
}
