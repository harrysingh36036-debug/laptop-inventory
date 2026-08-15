import { useEffect, useMemo, useState } from 'react';
import { hashAadhar } from '../utils';

const EMPTY_NEW = { name: '', phone: '', email: '', address: '', notes: '' };

export default function SellModal({ open, laptop, customers, onSave, onAddCustomer, onClose }) {
  const [price, setPrice] = useState('');
  const [buyer, setBuyer] = useState('');
  const [newCustomer, setNewCustomer] = useState(false);
  const [newForm, setNewForm] = useState(EMPTY_NEW);
  const [aadharNo, setAadharNo] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      const suggested = laptop?.purchase_rate
        ? Math.round(Number(laptop.purchase_rate) * 1.2)
        : '';
      setPrice(suggested);
      setBuyer('');
      setNewCustomer(false);
      setNewForm(EMPTY_NEW);
      setAadharNo('');
    }
  }, [open, laptop]);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const num = Number(price);
    if (!Number.isFinite(num) || num < 0) {
      return onSave?.(null, { cost: laptop?.cost_price });
    }
    let aadharHash = null;
    if (aadharNo.trim()) {
      if (!/^\d{12}$/.test(aadharNo.trim())) {
        return onSave?.(null, { cost: laptop?.cost_price, aadharError: 'Aadhar number must be exactly 12 digits.' });
      }
      aadharHash = await hashAadhar(aadharNo);
    }
    setBusy(true);
    try {
      if (newCustomer) {
        const n = newForm.name.trim();
        if (!n) throw new Error('Customer name is required');
        const added = await onAddCustomer?.({ name: n, phone: newForm.phone, email: newForm.email, address: newForm.address, notes: newForm.notes });
        if (!added) return;
        setBuyer(added.id);
        onSave?.(num, { customerId: added.id, aadharHash });
      } else {
        onSave?.(num, { customerId: buyer ? Number(buyer) : null, aadharHash });
      }
    } finally {
      setBusy(false);
    }
  };

  const cost = Number(laptop?.purchase_rate || 0) + Number(laptop?.extra_charges || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-line bg-surface p-6 shadow-pop">
        <header className="flex items-center justify-between">
          <h2 className="font-display text-base font-semibold tracking-tight text-ink">
            Sell {laptop?.brand_model}
          </h2>
          <button onClick={onClose} className="text-ink-faint hover:text-ink" aria-label="Close">
            ×
          </button>
        </header>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="flabel">Sale Price (₹)</label>
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              type="number" min="0" step="1000"
              placeholder={cost ? String(cost) : ''}
              className="field w-full"
              autoFocus
            />
            {cost ? <p className="mt-1 text-xs text-ink-faint">Cost: ₹{Math.round(cost).toLocaleString('en-IN')}</p> : null}
          </div>

          <div className="flex items-center gap-2">
            <input
              id="newCustomer" type="checkbox"
              checked={newCustomer}
              onChange={() => setNewCustomer(!newCustomer)}
              className="accent-accent"
            />
            <label htmlFor="newCustomer" className="text-sm text-ink-dim">Customer purchases this</label>
          </div>

          {!newCustomer ? (
            <div>
              <label className="flabel">Customer</label>
              <select value={buyer} onChange={(e) => setBuyer(e.target.value)} className="field mt-1 w-full">
                <option value="">— No customer —</option>
                {(customers || []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="space-y-3">
              <FormRow label="Name" value={newForm.name} onChange={(name) => setNewForm({ ...newForm, name })} placeholder="e.g. Priya Sharma" required />
              <FormRow label="Phone" value={newForm.phone} onChange={(phone) => setNewForm({ ...newForm, phone })} placeholder="e.g. 98xxxxxxxx" maxLength={12} />
              <FormRow label="Email" value={newForm.email} onChange={(email) => setNewForm({ ...newForm, email })} placeholder="e.g. name@example.com" />
              <FormRow label="Address" value={newForm.address} onChange={(address) => setNewForm({ ...newForm, address })} placeholder="Shipping / billing address" />
            </div>
          )}

          <div>
            <label className="flabel">Purchaser Aadhar No.</label>
            <input
              value={aadharNo}
              onChange={(e) => setAadharNo(e.target.value)}
              inputMode="numeric"
              maxLength={12}
              placeholder="Optional · 12-digit Aadhar"
              className="field w-full"
            />
            <p className="mt-1 text-xs text-ink-faint">Hashed before saving; recorded on this laptop.</p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
            <button type="submit" disabled={busy} className="btn-accent disabled:opacity-50">
              {busy ? 'Selling…' : 'Confirm Sale'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FormRow({ label, value, onChange, placeholder, required, maxLength }) {
  return (
    <div>
      <label className="flabel">{label}{required && ' *'}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="field mt-1 w-full"
      />
    </div>
  );
}
