import { useState, useEffect } from 'react';
import { hashAadhar } from '../utils';

const STATUSES = ['In Stock', 'In Transit'];

const SOURCE_TYPES = [
  ['customer', 'Customer'],
  ['vendor', 'Vendor'],
  ['others', 'Others']
];

const EMPTY = {
  purchased_at: '',
  brand: '',
  brand_model: '',
  serial_number: '',
  processor: '',
  generation: '',
  ram: '',
  storage: '',
  graphics: '',
  source_type: 'others',
  source_id: '',
  purchased_from: '',
  purchase_rate: '',
  extra_charges: '',
  quantity: 1,
  current_store_id: '',
  status: 'In Stock',
  comment: '',
  aadhar_no: '',
  purchaser_name: '',
  purchaser_phone: ''
};

export default function PurchaseModal({ stores, customers = [], vendors = [], editing, onSave, onClose }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');

  useEffect(() => {
    setForm(
      editing
        ? {
            purchased_at: editing.purchased_at ? editing.purchased_at.slice(0, 16) : '',
            brand: editing.brand || '',
            brand_model: editing.brand_model || '',
            serial_number: editing.serial_number || '',
            processor: editing.processor || '',
            generation: editing.generation || '',
            ram: editing.ram || '',
            storage: editing.storage || '',
            graphics: editing.graphics || '',
            source_type: editing.source_type || 'others',
            source_id: editing.source_id ?? '',
            purchased_from: editing.purchased_from || '',
            purchase_rate: editing.purchase_rate ?? '',
            extra_charges: editing.extra_charges ?? '',
            quantity: editing.quantity || 1,
            current_store_id: editing.current_store_id ?? '',
            status: editing.status || 'In Stock',
            comment: editing.comment || '',
aadhar_no: editing.purchaser_aadhar || editing.aadhar_no || '',
            purchaser_name: editing.purchaser_name || '',
            purchaser_phone: editing.purchaser_phone || ''
          }
        : EMPTY
    );
    setError('');
  }, [editing]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setN = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value === '' ? '' : Number(e.target.value) }));

  // Selecting a customer / vendor from the saved lists fills the "bought from"
  // name; customers also pre-fill their PII into the purchaser fields.
  const pickSource = (type, id) => {
    if (!id) {
      setForm((f) => ({ ...f, source_id: '', purchased_from: '' }));
      return;
    }
    if (type === 'customer') {
      const c = customers.find((x) => Number(x.id) === Number(id));
      setForm((f) => ({
        ...f,
        source_type: 'customer',
        source_id: c ? c.id : '',
        purchased_from: c ? c.name : '',
        purchaser_name: c ? c.name : f.purchaser_name,
        purchaser_phone: c && c.phone ? String(c.phone).replace(/\D/g, '').slice(0, 10) : f.purchaser_phone
      }));
    } else if (type === 'vendor') {
      const v = vendors.find((x) => Number(x.id) === Number(id));
      setForm((f) => ({
        ...f,
        source_type: 'vendor',
        source_id: v ? v.id : '',
        purchased_from: v ? v.name : ''
      }));
    }
  };

  const switchSourceType = (e) => {
    const type = e.target.value;
    setForm((f) => ({
      ...f,
      source_type: type,
      source_id: '',
      purchased_from: type === 'others' ? f.purchased_from : ''
    }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.brand.trim() && !form.brand_model.trim()) {
      setError('Enter at least a brand or model for what was purchased.');
      return;
    }
    const rate = Number(form.purchase_rate || 0);
    if (rate <= 0) {
      setError('Enter the purchase rate — this is a spending ledger.');
      return;
    }
    if (!editing && !form.aadhar_no.trim()) {
      setError('Aadhar number is mandatory when adding a purchase.');
      return;
    }
    if (!editing && !form.purchaser_name.trim()) {
      setError('Purchaser name is mandatory when adding a purchase.');
      return;
    }
    if (!editing && !form.purchaser_phone.trim()) {
      setError('Phone number is mandatory when adding a purchase.');
      return;
    }
    if (form.purchaser_phone.trim() && !/^\d{10}$/.test(form.purchaser_phone.trim())) {
      setError('Phone number must be exactly 10 digits.');
      return;
    }
    if (form.aadhar_no.trim() && !/^\d{12}$/.test(form.aadhar_no.trim())) {
      setError('Aadhar number must be exactly 12 digits.');
      return;
    }
    const payload = { ...form };
    payload.purchaser_name = form.purchaser_name.trim();
    payload.purchaser_phone = form.purchaser_phone.trim();
    payload.source_type = form.source_type || 'others';
    payload.source_id = form.source_id === '' || form.source_id == null ? null : Number(form.source_id);
    if (form.aadhar_no.trim()) {
      payload.purchaser_aadhar = form.aadhar_no.trim();
      payload.purchaser_aadhar_hash = await hashAadhar(form.aadhar_no.trim());
    }
    setError('');
    await onSave(payload);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm">
      <div className="my-8 w-full max-w-2xl rounded-2xl border border-line bg-surface p-6 shadow-pop">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-base font-semibold tracking-tight text-ink">
              {editing ? 'Edit Purchase Record' : 'Record a Purchase'}
            </h3>
            <p className="mt-1 text-xs text-ink-faint">
              Separate spending ledger — records how much money was spent buying the system. Not linked to inventory units.
            </p>
          </div>
          <button onClick={onClose} className="text-ink-faint hover:text-ink transition-colors" aria-label="Close purchase modal">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <p className="mt-3 rounded-lg border border-stock-risk/30 bg-stock-risk/10 px-3 py-2 text-sm text-stock-risk">{error}</p>
        )}

        <form onSubmit={submit} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="flabel">Purchased On</label>
              <input type="datetime-local" value={form.purchased_at} onChange={set('purchased_at')} className="field mt-1.5" />
            </div>
            <div>
              <label className="flabel">Vendor / Bought From</label>
              <select value={form.source_type} onChange={switchSourceType} className="field mt-1.5">
                {SOURCE_TYPES.map(([k, n]) => (
                  <option key={k} value={k}>{n}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="flabel">{form.source_type === 'customer' ? 'Customer' : form.source_type === 'vendor' ? 'Vendor' : 'Dealer / Shop / Other'}</label>
              {form.source_type === 'customer' && (
                <select
                  value={form.source_id}
                  onChange={(e) => pickSource('customer', e.target.value)}
                  className="field mt-1.5"
                >
                  <option value="">— Choose customer —</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>
                  ))}
                </select>
              )}
              {form.source_type === 'vendor' && (
                <select
                  value={form.source_id}
                  onChange={(e) => pickSource('vendor', e.target.value)}
                  className="field mt-1.5"
                >
                  <option value="">— Choose vendor —</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              )}
              {form.source_type === 'others' && (
                <input value={form.purchased_from} onChange={set('purchased_from')} placeholder="Dealer, shop or person…" className="field mt-1.5" />
              )}
            </div>
            <div>
              <label className="flabel">Purchaser Aadhar No. {!editing && <span className="text-stock-risk">*</span>}</label>
              <input value={form.aadhar_no} onChange={set('aadhar_no')} inputMode="numeric" maxLength={12}
                placeholder={editing ? (form.aadhar_no ? '' : 'Optional on edit') : '12-digit Aadhar (required)'}
                className="field mt-1.5" />
              <p className="mt-1 text-xs text-ink-faint">Hashed before saving; admin can view the full number.</p>
            </div>
            <div>
              <label className="flabel">Purchaser Name {!editing && <span className="text-stock-risk">*</span>}</label>
              <input value={form.purchaser_name} onChange={set('purchaser_name')} placeholder="Full name of buyer…"
                className="field mt-1.5" />
            </div>
            <div>
              <label className="flabel">Phone Number {!editing && <span className="text-stock-risk">*</span>}</label>
              <input value={form.purchaser_phone} onChange={set('purchaser_phone')} inputMode="numeric" maxLength={10}
                placeholder="10-digit mobile (required)"
                className="field mt-1.5" />
              <p className="mt-1 text-xs text-ink-faint">Visible to admins only.</p>
            </div>
            <div>
              <label className="flabel">Brand</label>
              <input value={form.brand} onChange={set('brand')} placeholder="e.g. HP, Lenovo, Dell" className="field mt-1.5" />
            </div>
            <div>
              <label className="flabel">Model</label>
              <input value={form.brand_model} onChange={set('brand_model')} placeholder="e.g. Pavilion 15" className="field mt-1.5" />
            </div>
            <div>
              <label className="flabel">Serial Number</label>
              <input value={form.serial_number} onChange={set('serial_number')} placeholder="e.g. 5CG1234ABC" className="field mt-1.5" />
            </div>
            <div>
              <label className="flabel">Processor</label>
              <input value={form.processor} onChange={set('processor')} placeholder="e.g. Core i5 1240P" className="field mt-1.5" />
            </div>
            <div>
              <label className="flabel">Generation</label>
              <input value={form.generation} onChange={set('generation')} placeholder="e.g. 11th Gen" className="field mt-1.5" />
            </div>
            <div>
              <label className="flabel">Graphics</label>
              <input value={form.graphics} onChange={set('graphics')} placeholder="e.g. NVIDIA GTX 1650" className="field mt-1.5" />
            </div>
            <div>
              <label className="flabel">RAM</label>
              <input value={form.ram} onChange={set('ram')} placeholder="e.g. 16 GB" className="field mt-1.5" />
            </div>
            <div>
              <label className="flabel">Storage</label>
              <input value={form.storage} onChange={set('storage')} placeholder="e.g. 512 GB SSD" className="field mt-1.5" />
            </div>
            <div>
              <label className="flabel">Purchase Rate (₹)</label>
              <input type="number" min="0" value={form.purchase_rate} onChange={setN('purchase_rate')} placeholder="0" className="field mt-1.5" />
            </div>
            <div>
              <label className="flabel">Extra Charges (₹)</label>
              <input type="number" min="0" value={form.extra_charges} onChange={setN('extra_charges')} placeholder="0" className="field mt-1.5" />
            </div>
            <div>
              <label className="flabel">Quantity</label>
              <input type="number" min="1" value={form.quantity} onChange={setN('quantity')} className="field mt-1.5" />
            </div>
            <div>
              <label className="flabel">Store</label>
              <select value={form.current_store_id} onChange={set('current_store_id')} className="field mt-1.5">
                <option value="">—</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.store_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="flabel">Status</label>
              <select value={form.status} onChange={set('status')} className="field mt-1.5">
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="flabel">Comment / Notes</label>
              <textarea value={form.comment} onChange={set('comment')} rows={2} placeholder="Optional notes about this purchase…" className="field mt-1.5" />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost">
              Cancel
            </button>
            <button type="submit" className="btn-accent">
              {editing ? 'Save changes' : 'Record purchase'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
