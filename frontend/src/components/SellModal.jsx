import { useEffect, useMemo, useState } from 'react';
import AutocompleteInput from './AutocompleteInput';

const EMPTY_NEW = { name: '', phone: '', email: '', address: '', notes: '' };

export default function SellModal({ open, laptop, customers, onSave, onAddCustomer, onClose }) {
  const [price, setPrice] = useState('');
  const [buyer, setBuyer] = useState('');
  const [newCustomer, setNewCustomer] = useState(false);
  const [newForm, setNewForm] = useState(EMPTY_NEW);
  const [busy, setBusy] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [paymentDetail, setPaymentDetail] = useState('');
  const [payError, setPayError] = useState('');
  const [priceError, setPriceError] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      const suggested = laptop?.purchase_rate
        ? Math.round(Number(laptop.purchase_rate) * 1.2)
        : '';
      setPrice(suggested);
      setBuyer('');
      setNewCustomer(false);
      setNewForm(EMPTY_NEW);
      setPaymentMethod('Cash');
      setPaymentDetail('');
      setPayError('');
      setPriceError('');
      setError('');
    }
  }, [open, laptop]);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const num = Number(price);
    if (!Number.isFinite(num)) {
      setPriceError('Amount is required.');
      return;
    }
    setPriceError('');
    if ((paymentMethod === 'UPI' || paymentMethod === 'Credit Card') && !paymentDetail.trim()) {
      setPayError(paymentMethod === 'UPI' ? 'Please enter the UPI name' : 'Please enter the machine name');
      return;
    }
    setPayError('');
    if (!newCustomer && !buyer) {
      setError('Customer is required. Select an existing customer or create a new one.');
      return;
    }
    if (newCustomer) {
      const n = newForm.name.trim();
      const p = newForm.phone.trim();
      if (!n) { setError('Customer name is required.'); return; }
      if (!p) { setError('Customer phone number is required.'); return; }
    }
    setError('');
    setBusy(true);
    try {
      if (newCustomer) {
        const n = newForm.name.trim();
        const added = await onAddCustomer?.({ name: n, phone: newForm.phone, email: newForm.email, address: newForm.address, notes: newForm.notes });
        if (!added) return;
        setBuyer(added.id);
        onSave?.(num, { customerId: added.id, paymentMethod, paymentDetail });
      } else {
        onSave?.(num, { customerId: Number(buyer), paymentMethod, paymentDetail });
      }
    } finally {
      setBusy(false);
    }
  };

  const cost = Number(laptop?.purchase_rate || 0) + Number(laptop?.extra_charges || 0);

  // Known names/phones to predict against when adding a new customer.
  const knownNames = useMemo(
    () => [...new Set((customers || []).map((c) => c.name).filter(Boolean))].sort(),
    [customers]
  );
  const knownPhones = useMemo(
    () => [...new Set((customers || []).map((c) => c.phone).filter(Boolean))].sort(),
    [customers]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-lg">
        <header className="flex items-center justify-between">
          <h2 className="  text-base font-semibold tracking-tight text-gray-900">
            Sell {laptop?.brand_model}
          </h2>
          <button onClick={onClose} className="text-gray-900-faint hover:text-gray-900" aria-label="Close">
            ×
          </button>
        </header>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="flabel">Sale Price (₹)</label>
            <input
              value={price}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9.\-]/g, '');
                setPrice(v);
                setPriceError('');
              }}
              type="text" inputMode="decimal"
              placeholder={cost ? String(cost) : 'Any amount (e.g. -500, 0, 12500.50)'}
              className="field w-full"
              autoFocus
            />
            {priceError && <p className="mt-1 text-sm text-red-600">{priceError}</p>}
            {cost ? <p className="mt-1 text-xs text-gray-900-faint">Cost: ₹{Math.round(cost).toLocaleString('en-IN')}</p> : null}
          </div>

          <div className="flex items-center gap-2">
            <input
              id="newCustomer" type="checkbox"
              checked={newCustomer}
              onChange={() => setNewCustomer(!newCustomer)}
              className="accent-accent"
            />
            <label htmlFor="newCustomer" className="text-sm text-gray-600">New customer (not in list)</label>
          </div>

          {!newCustomer ? (
            <div>
              <label className="flabel">Customer *</label>
              <select value={buyer} onChange={(e) => { setBuyer(e.target.value); setError(''); }} className="field mt-1 w-full" required>
                <option value="">— Select a customer —</option>
                {(customers || []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="flabel">Name *</label>
                <AutocompleteInput
                  id="new-customer-name-suggestions"
                  value={newForm.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setNewForm((f) => {
                      // Picking/typing a known name autofills that customer's phone.
                      const match = (customers || []).find((c) => c.name === name);
                      return { ...f, name, phone: match?.phone ? match.phone : f.phone };
                    });
                  }}
                  suggestions={knownNames}
                  placeholder="e.g. Priya Sharma"
                  className="field mt-1 w-full"
                  emptyText="No match — will be saved as a new customer"
                />
              </div>
              <div>
                <label className="flabel">Phone *</label>
                <AutocompleteInput
                  id="new-customer-phone-suggestions"
                  value={newForm.phone}
                  onChange={(e) => setNewForm({ ...newForm, phone: e.target.value })}
                  suggestions={knownPhones}
                  placeholder="e.g. 98xxxxxxxx"
                  maxLength={12}
                  className="field mt-1 w-full"
                />
              </div>
              <FormRow label="Email" value={newForm.email} onChange={(email) => setNewForm({ ...newForm, email })} placeholder="e.g. name@example.com" />
              <FormRow label="Address" value={newForm.address} onChange={(address) => setNewForm({ ...newForm, address })} placeholder="Shipping / billing address" />
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="flabel">Payment Method</label>
              <select value={paymentMethod} onChange={(e) => { setPaymentMethod(e.target.value); setPaymentDetail(''); setPayError(''); }} className="field mt-1 w-full">
                <option value="Cash">Cash</option>
                <option value="UPI">UPI</option>
                <option value="Credit Card">Credit Card</option>
              </select>
            </div>

            {paymentMethod === 'UPI' && (
              <FormRow label="UPI Name" value={paymentDetail} onChange={setPaymentDetail} placeholder="e.g. Priya Sharma (UPI)" required />
            )}
            {paymentMethod === 'Credit Card' && (
              <FormRow label="Machine Name" value={paymentDetail} onChange={setPaymentDetail} placeholder="e.g. POS 02" required />
            )}
            {payError && <p className="text-sm text-red-600">{payError}</p>}
          </div>

          {error && <p className="text-sm font-medium text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100">Cancel</button>
            <button type="submit" disabled={busy || (!newCustomer && !buyer)} className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
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
