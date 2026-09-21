import { useMemo, useState } from 'react';
import { inr } from '../utils';
import AutocompleteInput from './AutocompleteInput';

const STATUSES = ['Pending', 'In Progress', 'Repaired'];

const empty = {
  laptop_id: '',
  serial_number: '',
  brand_model: '',
  issue: '',
  vendor: '',
  cost: '',
  charge: '',
  store_id: '',
  status: 'Pending',
  notes: ''
};

export default function RepairModal({ editing = null, laptops = [], repairs = [], stores = [], homeStoreId = null, onSave, onClose }) {
  const [form, setForm] = useState(
    editing
      ? {
          laptop_id: editing.laptop_id ?? '',
          serial_number: editing.serial_number || '',
          brand_model: editing.brand_model || '',
          issue: editing.issue || '',
          vendor: editing.vendor || '',
          cost: editing.cost ?? '',
          charge: editing.charge ?? '',
          store_id: editing.store_id ?? (homeStoreId ? String(homeStoreId) : ''),
          status: editing.status || 'Pending',
          notes: editing.notes || ''
        }
      : { ...empty, store_id: homeStoreId ? String(homeStoreId) : '' }
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Text-prediction pools from past records.
  const modelSuggestions = useMemo(
    () => [...new Set(laptops.map((l) => l.brand_model).filter(Boolean))].sort(),
    [laptops]
  );
  const vendorSuggestions = useMemo(
    () => [...new Set(repairs.map((r) => r.vendor).filter(Boolean))].sort(),
    [repairs]
  );

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
    if (stores.length > 0 && !form.store_id) return setError('Please select a store');
    setBusy(true);
    setError('');
    const err = await onSave(form);
    setBusy(false);
    if (err) setError(err);
  };

  const input = 'w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-900-faint focus:border-blue-200 focus:outline-none';
  const label = 'mb-1 block text-xs font-medium text-gray-900-dim';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <form onSubmit={submit} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gray-200 bg-white p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="  text-base font-semibold tracking-tight text-gray-900">
            {editing ? 'Edit Repair' : 'Add Repair'}
          </h2>
          <button type="button" onClick={onClose} className="text-gray-900-faint hover:text-gray-900 transition-colors" aria-label="Close">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          {stores.length > 0 && (
            <div>
              <label className={label} htmlFor="repair-store">Store *</label>
              <select
                id="repair-store"
                value={form.store_id}
                onChange={set('store_id')}
                className={input}
              >
                <option value="">— Select store —</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.store_name}
                  </option>
                ))}
              </select>
            </div>
          )}

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
              <AutocompleteInput
                id="repair-model-suggestions"
                value={form.brand_model}
                onChange={set('brand_model')}
                suggestions={modelSuggestions}
                placeholder="e.g. HP Spectre x360"
                className={input}
              />
            </div>
          </div>

          <div>
            <label className={label} htmlFor="repair-issue">Issue *</label>
            <textarea id="repair-issue" value={form.issue} onChange={set('issue')} rows={2} className={input} placeholder="e.g. Screen replacement, hinge loose, battery not charging…" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="repair-vendor">Repair Shop / Vendor</label>
              <AutocompleteInput
                id="repair-vendor-suggestions"
                value={form.vendor}
                onChange={set('vendor')}
                suggestions={vendorSuggestions}
                placeholder="e.g. City Tech Services"
                className={input}
              />
            </div>
            <div>
              <label className={label} htmlFor="repair-cost">Item Cost (₹)</label>
              <input id="repair-cost" value={form.cost} onChange={set('cost')} type="number" step="any" className={input} placeholder="Any amount" />
            </div>
          </div>

          <div>
            <label className={label} htmlFor="repair-charge">Charged to Customer (₹)</label>
            <input id="repair-charge" value={form.charge} onChange={set('charge')} type="number" step="any" className={input} placeholder="Any amount" />
            {Number.isFinite(Number(form.cost)) && Number.isFinite(Number(form.charge)) && form.cost !== '' && form.charge !== '' && (
              <p className="mt-1 text-xs text-gray-900-faint">
                Profit: {inr((Number(form.charge) || 0) - (Number(form.cost) || 0))}
              </p>
            )}
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

          {error && <p className="text-sm text-red-600">{error}</p>}
          {editing?.cost != null && !form.cost && (
            <p className="text-xs text-gray-900-faint">Currently {inr(editing.cost)} — leave the field empty to keep it.</p>
          )}
          {editing?.charge != null && !form.charge && (
            <p className="text-xs text-gray-900-faint">Currently charged {inr(editing.charge)} — leave the field empty to keep it.</p>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100">Cancel</button>
            <button type="submit" disabled={busy} className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40">
              {busy ? 'Saving…' : editing ? 'Save Changes' : 'Add Repair'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
