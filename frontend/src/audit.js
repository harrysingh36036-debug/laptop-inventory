// Central Console integration: fire-and-forget audit events to the console API.
// Enabled only when VITE_CONSOLE_API_URL is set. Never blocks the app; failures
// are swallowed so inventory operations keep working if the console is offline.

const CONSOLE_URL = (import.meta.env.VITE_CONSOLE_API_URL || '').replace(/\/$/, '');
const CONSOLE_SECRET = import.meta.env.VITE_CONSOLE_AUDIT_SECRET || '';

export const auditEnabled = () => !!CONSOLE_URL;

export function emitAudit(event) {
  if (!CONSOLE_URL || !event || !event.action) return;
  try {
    fetch(`${CONSOLE_URL}/webhook/audit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Audit-Secret': CONSOLE_SECRET
      },
      body: JSON.stringify({
        ...event,
        source: 'app',
        occurredAt: event.occurredAt || new Date().toISOString()
      })
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}