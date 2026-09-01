import supabase from './supabaseClient';

// Live presence for "who is currently logged in / active now".
// Uses Supabase Realtime Presence on a dedicated channel `online-users`.
// Every authenticated client tracks itself with its user payload and
// presenceState() tells Accounts tab who is online right now.

let channel = null;
let currentPresenceState = {}; // { [key: userId]: [{ user_id, username, ... }] }
const listeners = new Set();

function emit() {
  for (const cb of [...listeners]) {
    try { cb(currentPresenceState); } catch { /* isolated */ }
  }
}

function syncState() {
  if (!channel) return;
  try {
    currentPresenceState = channel.presenceState();
  } catch {
    currentPresenceState = {};
  }
  emit();
}

export function getPresenceState() {
  return currentPresenceState;
}

export function onPresenceChange(cb) {
  listeners.add(cb);
  // immediate fire with current snapshot
  try { cb(currentPresenceState); } catch { /* */ }
  return () => listeners.delete(cb);
}

/**
 * Join the presence channel as `user`.
 * user = { id, username, display_name, role, home_store_id }
 */
export async function joinPresence(user) {
  if (!user?.id) return;
  // already tracking the same user
  if (channel) {
    try { await supabase.removeChannel(channel); } catch { /* */ }
    channel = null;
    currentPresenceState = {};
  }
  const key = String(user.id);
  const ch = supabase.channel('online-users', {
    config: { presence: { key } },
  });

  ch.on('presence', { event: 'sync' }, () => syncState());
  ch.on('presence', { event: 'join' }, () => syncState());
  ch.on('presence', { event: 'leave' }, () => syncState());

  channel = ch;
  ch.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      try {
        await ch.track({
          user_id: String(user.id),
          username: user.username || '',
          display_name: user.display_name || user.username || '',
          role: user.role || '',
          home_store_id: user.home_store_id ?? null,
          online_at: new Date().toISOString(),
          ua: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 120) : '',
        });
        syncState();
      } catch { /* ignore */ }
    }
  });
}

export async function leavePresence() {
  if (channel) {
    try { await supabase.removeChannel(channel); } catch { /* */ }
    channel = null;
  }
  currentPresenceState = {};
  emit();
}

// Keep presence in sync with auth lifecycle - when Supabase signs out,
// leave immediately (App.jsx also calls leavePresence on logout).
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') {
    leavePresence();
  }
});
