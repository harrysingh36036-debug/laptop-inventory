import { useState, useEffect } from 'react';
import { useLabels } from '../labels.jsx';

const STATUSES = ['In Stock', 'In Transit', 'Sold'];

const EMPTY = {
  brand: '',
  brand_model: '',
  processor_type: '',
  generation: '',
  storage_type: '',
  purchased_from: '',
  graphics: 'no',
  graphics_type: '',
  graphics_model: '',
  purchase_rate: '',
  extra_charges: '',
  serial_number: '',
  quantity: 1,
  current_store_id: '',
  status: 'In Stock'
};

export default function InventoryModal({ stores, brands = [], editing, onSave, onClose }) {
  const t = useLabels();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');

  useEffect(() => {
    setForm(
      editing
        ? {
            brand: editing.brand || '',
            brand_model: editing.brand_model || '',
            processor_type: editing.processor_type || '',
            generation: editing.generation || '',
            storage_type: editing.storage_type || '',
            purchased_from: editing.purchased_from || '',
            graphics: editing.graphics || 'no',
            graphics_type: editing.graphics_type || '',
            graphics_model: editing.graphics_model || '',
            purchase_rate: editing.purchase_rate ?? '',
            extra_charges: editing.extra_charges ?? '',
            serial_number: editing.serial_number || '',
            quantity: 1,
            current_store_id: editing.current_store_id ?? '',
            status: editing.status || 'In Stock'
          }
        : EMPTY
    );
    setError('');
  }, [editing]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setN = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value === '' ? '' : Number(e.target.value) }));

  const brandPrefix = brands.find((b) => b.name.toLowerCase() === form.brand.toLowerCase())?.serial_prefix || '';

  const submit = async (e) => {
    e.preventDefault();
    if (!form.brand.trim() || !form.brand_model.trim()) {
      setError('Brand and Model are required.');
      return;
    }
    if (form.graphics === 'yes' && !form.graphics_type.trim()) {
      setError('Choose integrated or dedicated graphics when "Yes".');
      return;
    }
    // In bulk mode the backend auto-generates serials — drop the manual one.
    const payload = { ...form };
    if (payload.quantity > 1) {
      delete payload.serial_number;
      payload.serial_prefix = brandPrefix || undefined;
    } else if (!editing && !payload.serial_number.trim()) {
      setError('Serial Number is required (or set the quantity above 1).');
      return;
    }
    const err = await onSave(payload);
    if (err) setError(err);
  };

  const input = (cls = '') =>
    `mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none ${cls}`;
  const label = 'block text-sm font-medium text-slate-700';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={label}>Brand</label>
              <select
                value={form.brand}
                onChange={set('brand')}
                className={input('bg-white')}
              >
                <option value="">Select brand…</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.name}>{b.name}</option>
                ))}
              </select>
              {brandPrefix && !editing && (
                <p className="mt-1 text-xs text-emerald-600">
                  Serials will start with <code>{brandPrefix}</code> (auto-generated).
                </p>
              )}
            </div>
            <div>
              <label className={label}>Model</label>
              <input value={form.brand_model} onChange={set('brand_model')} placeholder="e.g. Spectre x360"
                className={input()} />
            </div>
            <div>
              <label className={label}>Processor</label>
              <input value={form.processor_type} onChange={set('processor_type')} placeholder="e.g. Core i5-1345U"
                className={input()} />
            </div>
            <div>
              <label className={label}>Generation</label>
              <input value={form.generation} onChange={set('generation')} placeholder="e.g. 13th"
                className={input()} />
            </div>
            <div>
              <label className={label}>Storage Type</label>
              <select value={form.storage_type} onChange={set('storage_type')} className={input('bg-white')}>
                <option value="">Select…</option>
                <option value="SSD">SSD</option>
                <option value="HDD">HDD</option>
              </select>
            </div>
            <div>
              <label className={label}>Purchased From (Vendor)</label>
              <input value={form.purchased_from} onChange={set('purchased_from')} placeholder="e.g. HP Direct"
                className={input()} />
            </div>
          </div>

          {/* Graphics */}
          <div className="rounded-lg border border-slate-200 p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className={label}>Graphics?</label>
                <select value={form.graphics} onChange={set('graphics')} className={input('bg-white')}>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </div>
              {form.graphics === 'yes' && (
                <>
                  <div>
                    <label className={label}>Number of Graphics</label>
                    <select value={form.graphics_type} onChange={set('graphics_type')} className={input('bg-white')}>
                      <option value="">Select…</option>
                      <option value="integrated">Integrated</option>
                      <option value="dedicated">Dedicated</option>
                    </select>
                  </div>
                  <div>
                    <label className={label}>Graphics Model</label>
                    <input value={form.graphics_model} onChange={set('graphics_model')} placeholder="e.g. RTX 4060"
                      className={input()} />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Pricing */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={label}>Purchase Rate (₹)</label>
              <input value={form.purchase_rate} onChange={set('purchase_rate')} type="number" min="0"
                placeholder="0" className={input()} />
            </div>
            <div>
              <label className={label}>Extra Charges (₹)</label>
              <input value={form.extra_charges} onChange={set('extra_charges')} type="number" min="0"
                placeholder="0" className={input()} />
            </div>
          </div>

          {/* Location, status, quantity */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={label}>Location</label>
              <select value={form.current_store_id} onChange={set('current_store_id')} className={input('bg-white')}>
                <option value="">Unassigned</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>{s.store_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>Status</label>
              <select value={form.status} onChange={set('status')} className={input('bg-white')}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            {!editing && (
              <div>
                <label className={`${label} flex items-center gap-1`}>{t.quantityLabel || 'Quantity'}</label>
                <input value={form.quantity} onChange={setN('quantity')} type="number" min="1" max="1000"
                  className={input()} />
                <p className="mt-1 text-xs text-slate-400">Bulk-add same spec with auto serials.</p>
              </div>
            )}
          </div>

          {!editing && form.quantity <= 1 && (
            <div>
              <label className={label}>Serial Number</label>
              <input value={form.serial_number} onChange={set('serial_number')}
                placeholder={brandPrefix ? `e.g. ${brandPrefix}001` : 'e.g. SN-000001'}
                className={input()} />
            </div>
          )}

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
              {editing ? 'Save Changes' : form.quantity > 1 ? `Add ${form.quantity} Units` : 'Add Laptop'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}