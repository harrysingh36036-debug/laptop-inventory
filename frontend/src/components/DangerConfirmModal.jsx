import { useState } from 'react';

// Delete confirmation: warning message, then password and remarks.
// Super admins bypass the password step.
export default function DangerConfirmModal({ title, warning, onConfirm, onClose, isSuperAdmin = false }) {
  const [password, setPassword] = useState('');
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    if (isSuperAdmin) {
      const msg = await onConfirm('', remarks.trim());
      setBusy(false);
      if (msg) setError(msg);
      return;
    }
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-red-600/30 bg-white p-6 shadow-lg">
        <h3 className="  text-base font-semibold tracking-tight text-red-600">{title || 'Confirm deletion'}</h3>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          {warning || 'This action cannot be undone. Please verify your identity before continuing.'}
        </p>

        {error && (
          <p className="mt-3 rounded-lg border border-red-600/30 bg-red-600/10 px-3 py-2 text-sm text-red-600">{error}</p>
        )}

        <form onSubmit={submit} className="mt-4 space-y-3">
          {!isSuperAdmin && (
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
          )}
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
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50">
              {busy ? (isSuperAdmin ? 'Deleting…' : 'Verifying…') : 'Delete permanently'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}