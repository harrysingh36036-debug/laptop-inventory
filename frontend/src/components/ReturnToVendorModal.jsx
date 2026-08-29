import { useState } from 'react';
import { deleteLaptop, updateLaptop } from '../api';

export default function ReturnToVendorModal({ laptop, onNotify, onClose }) {
  const [step, setStep] = useState('choose');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [remarks, setRemarks] = useState('');
  const [form, setForm] = useState({
    brand: laptop?.brand || '',
    brand_model: laptop?.brand_model || '',
    serial_number: laptop?.serial_number || '',
    purchase_rate: laptop?.purchase_rate != null ? String(laptop.purchase_rate) : '',
    ram: laptop?.ram || '',
    storage_type: laptop?.storage_type || '',
    storage_size: laptop?.storage_size || '',
    processor_type: laptop?.processor_type || '',
    generation: laptop?.generation || ''
  });

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleReturn = async (e) => {
    e.preventDefault();
    if (!password.trim()) { setError('Enter your password to confirm.'); return; }
    setBusy(true);
    setError('');
    try {
      await deleteLaptop(laptop.id, password.trim(), remarks.trim() || 'Returned to vendor');
      onNotify?.('Laptop returned to vendor and removed from inventory', 'success');
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleExchange = async (e) => {
    e.preventDefault();
    if (!password.trim()) { setError('Enter your password to confirm.'); return; }
    if (!form.brand.trim() || !form.brand_model.trim()) { setError('Brand and Model are required.'); return; }
    setBusy(true);
    setError('');
    try {
      await updateLaptop(laptop.id, {
        brand: form.brand.trim(),
        brand_model: form.brand_model.trim(),
        serial_number: form.serial_number.trim(),
        purchase_rate: form.purchase_rate !== '' ? Number(form.purchase_rate) : null,
        ram: form.ram.trim(),
        storage_type: form.storage_type.trim(),
        storage_size: form.storage_size.trim(),
        processor_type: form.processor_type.trim(),
        generation: form.generation.trim()
      });
      onNotify?.('Exchange processed — laptop config updated', 'success');
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-pop">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base font-semibold tracking-tight text-ink">Return to Vendor</h3>
          <button onClick={onClose} className="text-ink-faint hover:text-ink transition-colors" aria-label="Close">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mt-3 rounded-xl border border-line bg-surface-2/50 p-4 text-sm">
          <div className="flex justify-between"><span className="text-ink-faint">Brand</span><span className="text-ink">{laptop.brand || '—'}</span></div>
          <div className="mt-1.5 flex justify-between"><span className="text-ink-faint">Model</span><span className="text-ink">{laptop.brand_model || '—'}</span></div>
          <div className="mt-1.5 flex justify-between"><span className="text-ink-faint">Serial</span><span className="mono-chip">{laptop.serial_number}</span></div>
          {laptop.purchased_from && <div className="mt-1.5 flex justify-between"><span className="text-ink-faint">Vendor</span><span className="text-ink">{laptop.purchased_from}</span></div>}
        </div>

        {error && (
          <p className="mt-3 rounded-lg border border-stock-risk/30 bg-stock-risk/10 px-3 py-2 text-sm text-stock-risk">{error}</p>
        )}

        {step === 'choose' && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              onClick={() => setStep('confirm-return')}
              className="rounded-xl border border-stock-risk/25 bg-stock-risk/5 p-4 text-center transition-colors hover:bg-stock-risk/10"
            >
              <p className="text-sm font-semibold text-stock-risk">Return</p>
              <p className="mt-1 text-[11px] text-ink-faint">Remove laptop from inventory permanently.</p>
            </button>
            <button
              onClick={() => setStep('exchange')}
              className="rounded-xl border border-accent-line bg-accent-soft/20 p-4 text-center transition-colors hover:bg-accent-soft/40"
            >
              <p className="text-sm font-semibold text-accent">Exchange</p>
              <p className="mt-1 text-[11px] text-ink-faint">Replace with new config from vendor.</p>
            </button>
          </div>
        )}

        {step === 'confirm-return' && (
          <form onSubmit={handleReturn} className="mt-4 space-y-3">
            <p className="text-sm text-ink-dim">
              <strong>{laptop.brand_model}</strong> will be permanently removed from inventory.
            </p>
            <div>
              <label className="flabel">Your password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Confirm your identity" className="field mt-1.5" autoFocus />
            </div>
            <div>
              <label className="flabel">Reason</label>
              <input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. Defective unit returned to vendor" className="field mt-1.5" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => { setStep('choose'); setError(''); setPassword(''); setRemarks(''); }} className="btn-ghost">Back</button>
              <button type="submit" disabled={busy} className="btn-danger disabled:opacity-50">
                {busy ? 'Processing…' : 'Confirm Return'}
              </button>
            </div>
          </form>
        )}

        {step === 'exchange' && (
          <form onSubmit={handleExchange} className="mt-4 space-y-3">
            <p className="text-sm text-ink-dim">
              Enter the new configuration provided by the vendor for <strong>{laptop.brand_model}</strong>.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="flabel">Brand</label>
                <input value={form.brand} onChange={set('brand')} placeholder="e.g. HP" className="field mt-1.5" />
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
                <label className="flabel">Purchase Rate (₹)</label>
                <input type="number" min="0" value={form.purchase_rate} onChange={set('purchase_rate')} className="field mt-1.5" />
              </div>
              <div>
                <label className="flabel">Processor</label>
                <input value={form.processor_type} onChange={set('processor_type')} placeholder="e.g. Core i5" className="field mt-1.5" />
              </div>
              <div>
                <label className="flabel">Generation</label>
                <input value={form.generation} onChange={set('generation')} placeholder="e.g. 13th Gen" className="field mt-1.5" />
              </div>
              <div>
                <label className="flabel">RAM</label>
                <input value={form.ram} onChange={set('ram')} placeholder="e.g. 16 GB" className="field mt-1.5" />
              </div>
              <div>
                <label className="flabel">Storage</label>
                <input value={form.storage_size} onChange={set('storage_size')} placeholder="e.g. 512 GB" className="field mt-1.5" />
              </div>
            </div>
            <div>
              <label className="flabel">Your password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Confirm your identity" className="field mt-1.5" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => { setStep('choose'); setError(''); setPassword(''); }} className="btn-ghost">Back</button>
              <button type="submit" disabled={busy} className="btn-accent disabled:opacity-50">
                {busy ? 'Processing…' : 'Confirm Exchange'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
