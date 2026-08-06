import { useState, useEffect } from 'react';
import { useLabels } from '../labels.jsx';

const STATUSES = ['In Stock', 'In Transit', 'Sold'];
const EMPTY = { brand_model: '', serial_number: '', current_store_id: '', status: 'In Stock' };

export default function InventoryModal({ stores, editing, onSave, onClose }) {
  const t = useLabels();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');

  useEffect(() => {
    setForm(
      editing
        ? {
            brand_model: editing.brand_model,
            serial_number: editing.serial_number,
            current_store_id: editing.current_store_id ?? '',
            status: editing.status
          }
        : EMPTY
    );
    setError('');
  }, [editing]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.brand_model.trim() || !form.serial_number.trim()) {
      setError('Brand/Model and Serial Number are required.');
      return;
    }
    const err = await onSave(form);
    if (err) setError(err);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">
            {editing ? t.editLaptopTitle : t.addLaptopTitle}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={submit} className="mt-4 space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Brand / Model</label>
            <input
              value={form.brand_model}
              onChange={set('brand_model')}
              placeholder="e.g. Apple MacBook Pro 16"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">Serial Number</label>
            <input
              value={form.serial_number}
              onChange={set('serial_number')}
              placeholder="e.g. SN-999999"
              disabled={!!editing}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400"
            />
            {editing && (
              <p className="mt-1 text-xs text-slate-400">Serial number cannot be changed.</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-slate-700">Location</label>
              <select
                value={form.current_store_id}
                onChange={set('current_store_id')}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              >
                <option value="">Unassigned</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.store_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Status</label>
              <select
                value={form.status}
                onChange={set('status')}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
            >
              {editing ? 'Save Changes' : 'Add Laptop'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}