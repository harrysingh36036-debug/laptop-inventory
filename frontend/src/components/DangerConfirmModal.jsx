import { useState } from 'react';

// Delete confirmation: warning message, then the signed-in user's password and
// mandatory remarks before anything is deleted (verified server-side).
export default function DangerConfirmModal({ title, warning, onConfirm, onClose }) {
  const [password, setPassword] = useState('');
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const pwd = password.trim();
    if (!pwd) {
      setError('Enter your password to confirm.');
      setBusy(false);
      return;
    }
    const msg = await onConfirm(pwd, remarks.trim());
    setBusy(false);
    if (msg) setError(msg);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-fade">
      <div className="w-full max-w-md rounded-2xl border border-stock-risk/30 bg-surface p-6 shadow-pop animate-rise">
        <h3 className="font-display text-base font-semibold tracking-tight text-stock-risk">{title || 'Confirm deletion'}</h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-dim">
          {warning || 'This action cannot be undone. Please verify your identity before continuing.'}
        </p>

        {error && (
          <p className="mt-3 rounded-lg border border-stock-risk/30 bg-stock-risk/10 px-3 py-2 text-sm text-stock-risk">{error}</p>
        )}

        <form onSubmit={submit} className="mt-4 space-y-3">
          <div>
            <label className="flabel">Your account password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password…"
              autoFocus
              className="field mt-1.5"
            />
          </div>
          <div>
            <label className="flabel">Remarks (mandatory)</label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Why is this being deleted?"
              rows={2}
              className="field mt-1.5"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="btn-danger disabled:opacity-50">
              {busy ? 'Verifying…' : 'Delete permanently'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}