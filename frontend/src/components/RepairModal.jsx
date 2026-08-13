import { useState } from 'react';
import { inr } from '../utils';

const STATUSES = ['Pending', 'In Progress', 'Repaired'];

const empty = {
  laptop_id: '',
  serial_number: '',
  brand_model: '',
  issue: '',
  vendor: '',
  cost: '',
  status: 'Pending',
  notes: ''
};

export default function RepairModal({ editing = null, laptops = [], onSave, onClose }) {
  const [form, setForm] = useState(
    editing
      ? {
          laptop_id: editing.laptop_id ?? '',
          serial_number: editing.serial_number || '',
          brand_model: editing.brand_model || '',
          issue: editing.issue || '',
          vendor: editing.vendor || '',
          cost: editing.cost ?? '',
          status: editing.status || 'Pending',
          notes: editing.notes || ''
        }
      : empty
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (key) => (e) => {
    const value = e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
    if (key === 'laptop_id') {
      const l = laptops.find((x) => Number(x.id) === Number(value));
      if (l) setForm((f) => ({ ...f, serial_number: l.serial_number || '', brand_model: l.brand_model || '' }));
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.issue.trim()) return setError('Issue description is required');
    setBusy(true);
    setError('');
    const err = await onSave(form);
    setBusy(false);
    if (err) setError(err);
  };

  const input = 'w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent-line focus:outline-none';
  const label = 'mb-1 block text-xs font-medium text-ink-dim';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade">
      <form onSubmit={submit} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-pop animate-rise">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-base font-semibold tracking-tight text-ink">
            {editing ? 'Edit Repair' : 'Add Repair'}
          </h2>
          <button type="button" onClick={onClose} className="text-ink-faint hover:text-ink transition-colors" aria-label="Close">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className={label} htmlFor="repair-laptop">Laptop (optional)</label>
            <select
              id="repair-laptop"
              value={form.laptop_id}
              onChange={set('laptop_id')}
              className={input}
            >
              <option value="">— No laptop linked —</option>
              {laptops.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.brand_model} · {l.serial_number}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="repair-model">Brand / Model</label>
              <input id="repair-model" value={form.brand_model} onChange={set('brand_model')} className={input} placeholder="e.g. HP Spectre x360" />
            </div>
          </div>

          <div>
            <label className={label} htmlFor="repair-issue">Issue *</label>
            <textarea id="repair-issue" value={form.issue} onChange={set('issue')} rows={2} className={input} placeholder="e.g. Screen replacement, hinge loose, battery not charging…" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="repair-vendor">Repair Shop / Vendor</label>
              <input id="repair-vendor" value={form.vendor} onChange={set('vendor')} className={input} placeholder="e.g. City Tech Services" />
            </div>
            <div>
              <label className={label} htmlFor="repair-cost">Cost (₹)</label>
              <input id="repair-cost" value={form.cost} onChange={set('cost')} type="number" min="0" step="any" className={input} placeholder="0" />
            </div>
          </div>

          <div>
            <label className={label} htmlFor="repair-status">Status</label>
            <select id="repair-status" value={form.status} onChange={set('status')} className={input}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={label} htmlFor="repair-notes">Notes</label>
            <textarea id="repair-notes" value={form.notes} onChange={set('notes')} rows={2} className={input} placeholder="Anything else worth remembering…" />
          </div>

          {error && <p className="text-sm text-stock-risk">{error}</p>}
          {editing?.cost != null && !form.cost && (
            <p className="text-xs text-ink-faint">Currently {inr(editing.cost)} — leave the field empty to keep it.</p>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
            <button type="submit" disabled={busy} className="btn-accent disabled:cursor-not-allowed disabled:opacity-40">
              {busy ? 'Saving…' : editing ? 'Save Changes' : 'Add Repair'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
