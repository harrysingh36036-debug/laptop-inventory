import { useState, useEffect } from 'react';
import { useLabels } from '../labels.jsx';

const STATUSES = ['In Stock', 'In Transit'];
const SIZES = ['256 GB', '512 GB', '1 TB', '2 TB', '4 TB', '8 TB'];
const RAMS = ['4 GB', '8 GB', '12 GB', '16 GB', '24 GB', '32 GB', '64 GB'];

const EMPTY = {
  brand: '',
  product_line: '',
  brand_model: '',
  processor_type: '',
  ram: '',
  generation: '',
  storage_type: '',
  storage_size: '',
  purchased_from: '',
  graphics: 'no',
  graphics_type: '',
  graphics_model: '',
  purchase_rate: '',
  extra_charges: '',
  serial_number: '',
  quantity: 1,
  current_store_id: '',
  status: 'In Stock',
  purchase_comment: ''
};

export default function InventoryModal({ stores, brands = [], vendors = [], editing, onSave, onClose }) {
  const t = useLabels();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');

  useEffect(() => {
    setForm(
      editing
        ? {
            brand: editing.brand || '',
            product_line: editing.product_line || '',
            brand_model: editing.brand_model || '',
            processor_type: editing.processor_type || '',
            ram: editing.ram || '',
            generation: editing.generation || '',
            storage_type: editing.storage_type || '',
            storage_size: editing.storage_size || '',
            purchased_from: editing.purchased_from || '',
            graphics: editing.graphics || 'no',
            graphics_type: editing.graphics_type || '',
            graphics_model: editing.graphics_model || '',
            purchase_rate: editing.purchase_rate ?? '',
            extra_charges: editing.extra_charges ?? '',
            serial_number: editing.serial_number || '',
            quantity: 1,
            current_store_id: editing.current_store_id ?? '',
            status: editing.status || 'In Stock',
            purchase_comment: editing.purchase_comment || ''
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
    if (!form.purchase_comment.trim()) {
      setError('A purchase comment is required.');
      return;
    }
    // Bulk mode always auto-generates serials; single mode too (brand prefix).
    const payload = { ...form };
    if (payload.quantity > 1) {
      delete payload.serial_number;
      payload.serial_prefix = brandPrefix || undefined;
    } else if (!editing && !payload.serial_number.trim() && !brandPrefix) {
      setError('Serial Number is required (or use a brand with a serial prefix).');
      return;
    }
    const err = await onSave(payload);
    if (err) setError(err);
  };

  const input = (cls = '') => `field mt-1.5 ${cls}`;
  const label = 'flabel';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-line bg-surface shadow-pop">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface/95 px-6 py-4 backdrop-blur">
          <h2 className="font-display text-base font-semibold tracking-tight text-ink">
            {editing ? t.editLaptopTitle : t.addLaptopTitle}
          </h2>
          <button onClick={onClose} className="text-ink-faint hover:text-ink transition-colors" aria-label="Close">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={submit} className="space-y-5 p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={label}>Brand</label>
              <select
                value={form.brand}
                onChange={set('brand')}
                className={input()}
              >
                <option value="">Select brand…</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.name}>{b.name}</option>
                ))}
              </select>
              {brandPrefix && !editing && (
                <p className="mt-1 text-xs text-stock-ok">
                  Serials will start with <code className="mono-chip">{brandPrefix}</code> (auto-generated).
                </p>
              )}
            </div>
            <div>
              <label className={label}>Product Line</label>
              <input value={form.product_line} onChange={set('product_line')} placeholder="e.g. Inspiron"
                className={input()} />
              <p className="mt-1 text-xs text-ink-faint">Series / family, e.g. Inspiron, ThinkPad, Pavilion.</p>
            </div>
            <div>
              <label className={label}>Model</label>
              <input value={form.brand_model} onChange={set('brand_model')} placeholder="e.g. 15 3520"
                className={input()} />
            </div>
            <div>
              <label className={label}>Core Variant</label>
              <input value={form.processor_type} onChange={set('processor_type')} placeholder="e.g. Core i5-1345U"
                className={input()} />
            </div>
            <div>
              <label className={label}>Generation</label>
              <input value={form.generation} onChange={set('generation')} placeholder="e.g. 13th Gen"
                className={input()} />
            </div>
            <div>
              <label className={label}>RAM</label>
              <input
                value={form.ram}
                onChange={set('ram')}
                list="ram-sizes"
                placeholder="e.g. 16 GB"
                className={input()}
              />
              <datalist id="ram-sizes">
                {RAMS.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </div>
            <div>
              <label className={label}>SSD / Storage Type</label>
              <select value={form.storage_type} onChange={set('storage_type')} className={input()}>
                <option value="">Select…</option>
                <option value="SSD">SSD</option>
                <option value="HDD">HDD</option>
              </select>
            </div>
            <div>
              <label className={label}>Storage Size</label>
              <input
                value={form.storage_size}
                onChange={set('storage_size')}
                list="storage-sizes"
                placeholder="e.g. 512 GB"
                className={input()}
              />
              <datalist id="storage-sizes">
                {SIZES.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            <div>
              <label className={label}>Purchased From (Customer / Dealer)</label>
              <input
                value={form.purchased_from}
                onChange={set('purchased_from')}
                list="vendor-list"
                placeholder="e.g. HP Direct"
                className={input()}
              />
              <datalist id="vendor-list">
                {vendors.map((v) => (
                  <option key={v.id} value={v.name} />
                ))}
              </datalist>
            </div>
          </div>

          {/* Graphics */}
          <div className="rounded-xl border border-line bg-surface-2/40 p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className={label}>Graphics?</label>
                <select value={form.graphics} onChange={set('graphics')} className={input()}>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </div>
              {form.graphics === 'yes' && (
                <>
                  <div>
                    <label className={label}>Number of Graphics</label>
                    <select value={form.graphics_type} onChange={set('graphics_type')} className={input()}>
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
              <select value={form.current_store_id} onChange={set('current_store_id')} className={input()}>
                <option value="">Unassigned</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>{s.store_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>Status</label>
              {form.status === 'Sold' ? (
                <p className="px-1 pt-1.5 text-sm text-stock-sold">Sold — final. Use the Sell action for new sales.</p>
              ) : (
                <select value={form.status} onChange={set('status')} className={input()}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              )}
            </div>
            {!editing && (
              <div>
                <label className={label}>{t.quantityLabel || 'Quantity'}</label>
                <input value={form.quantity} onChange={setN('quantity')} type="number" min="1" max="1000"
                  className={input()} />
                <p className="mt-1 text-xs text-ink-faint">Bulk-add same spec with auto serials.</p>
              </div>
            )}
          </div>

          {!editing && form.quantity <= 1 && (
            <div>
              <label className={label}>Serial Number</label>
              <input value={form.serial_number} onChange={set('serial_number')}
                placeholder={brandPrefix ? `e.g. ${brandPrefix}001` : 'e.g. SN-000001'}
                className={input()} />
              <p className="mt-1 text-xs text-ink-faint">
                {brandPrefix ? 'Leave blank to auto-generate the next serial.' : 'Required unless the brand has a serial prefix.'}
              </p>
            </div>
          )}

          <div>
            <label className={label}>Comment *</label>
            <textarea
              value={form.purchase_comment}
              onChange={set('purchase_comment')}
              rows={2}
              placeholder="e.g. Purchased from dealer at CST Road with 1-year warranty…"
              className={`${input()} resize-y`}
            />
            <p className="mt-1 text-xs text-ink-faint">Required for every purchase / inventory edit.</p>
          </div>

          {error && (
            <p className="rounded-lg border border-stock-risk/25 bg-stock-risk/10 px-3 py-2 text-sm text-stock-risk">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <button type="button" onClick={onClose} className="btn-ghost">
              Cancel
            </button>
            <button type="submit" className="btn-accent">
              {editing ? 'Save Changes' : form.quantity > 1 ? `Add ${form.quantity} Units` : 'Add Laptop'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}