import { useState } from 'react';
import { inr } from '../utils';
import { deleteSale, sellLaptop, getLaptops } from '../api';

export default function ReturnSaleModal({ sale, stores, onNotify, onClose, onDone }) {
  const [step, setStep] = useState('choose'); // choose | confirm-refund | exchange-pick
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [remarks, setRemarks] = useState('');
  const [laptops, setLaptops] = useState([]);
  const [selectedLaptop, setSelectedLaptop] = useState('');
  const [salePrice, setSalePrice] = useState('');

  const storeName = (id) => stores.find((s) => s.id === id)?.store_name || '';

  const handleRefund = async (e) => {
    e.preventDefault();
    if (!password.trim()) { setError('Enter your password to confirm.'); return; }
    setBusy(true);
    setError('');
    try {
      await deleteSale(sale.id, password.trim(), remarks.trim() || 'Refund — customer return');
      onNotify?.('Refund processed — laptop returned to In Stock', 'success');
      onDone?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const loadAvailableLaptops = async () => {
    setBusy(true);
    setError('');
    try {
      const all = await getLaptops({ storeId: sale.store_id || undefined });
      const available = (all || []).filter((l) => l.status === 'In Stock');
      setLaptops(available);
      setStep('exchange-pick');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleExchange = async (e) => {
    e.preventDefault();
    if (!selectedLaptop) { setError('Select a replacement laptop.'); return; }
    const price = Number(salePrice);
    if (!price || price <= 0) { setError('Enter a valid sale price.'); return; }
    setBusy(true);
    setError('');
    try {
      await deleteSale(sale.id, '', 'Exchange — old laptop returned');
      await sellLaptop(Number(selectedLaptop), price);
      onNotify?.('Exchange processed — old laptop returned, new sale created', 'success');
      onDone?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-pop">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base font-semibold tracking-tight text-ink">Return — {sale.brand_model}</h3>
          <button onClick={onClose} className="text-ink-faint hover:text-ink transition-colors" aria-label="Close">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mt-3 rounded-xl border border-line bg-surface-2/50 p-4 text-sm">
          <div className="flex justify-between"><span className="text-ink-faint">Serial</span><span className="mono-chip">{sale.serial_number}</span></div>
          <div className="mt-1.5 flex justify-between"><span className="text-ink-faint">Sold for</span><span className="font-semibold text-ink">{inr(sale.sale_price)}</span></div>
          <div className="mt-1.5 flex justify-between"><span className="text-ink-faint">Store</span><span className="text-ink">{storeName(sale.store_id)}</span></div>
        </div>

        {error && (
          <p className="mt-3 rounded-lg border border-stock-risk/30 bg-stock-risk/10 px-3 py-2 text-sm text-stock-risk">{error}</p>
        )}

        {step === 'choose' && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              onClick={() => setStep('confirm-refund')}
              className="rounded-xl border border-stock-risk/25 bg-stock-risk/5 p-4 text-center transition-colors hover:bg-stock-risk/10"
            >
              <p className="text-sm font-semibold text-stock-risk">Refund</p>
              <p className="mt-1 text-[11px] text-ink-faint">Laptop returns to In Stock. Sale removed.</p>
            </button>
            <button
              onClick={loadAvailableLaptops}
              disabled={busy}
              className="rounded-xl border border-accent-line bg-accent-soft/20 p-4 text-center transition-colors hover:bg-accent-soft/40 disabled:opacity-50"
            >
              <p className="text-sm font-semibold text-accent">Exchange</p>
              <p className="mt-1 text-[11px] text-ink-faint">Return old, sell a replacement.</p>
            </button>
          </div>
        )}

        {step === 'confirm-refund' && (
          <form onSubmit={handleRefund} className="mt-4 space-y-3">
            <p className="text-sm text-ink-dim">
              The sale of <strong>{sale.brand_model}</strong> will be reversed. The laptop returns to <strong>In Stock</strong>.
            </p>
            <div>
              <label className="flabel">Your password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Confirm your identity" className="field mt-1.5" autoFocus />
            </div>
            <div>
              <label className="flabel">Reason</label>
              <input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. Customer returned defective unit" className="field mt-1.5" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => { setStep('choose'); setError(''); setPassword(''); setRemarks(''); }} className="btn-ghost">Back</button>
              <button type="submit" disabled={busy} className="btn-danger disabled:opacity-50">
                {busy ? 'Processing…' : 'Confirm Refund'}
              </button>
            </div>
          </form>
        )}

        {step === 'exchange-pick' && (
          <form onSubmit={handleExchange} className="mt-4 space-y-3">
            <p className="text-sm text-ink-dim">
              Select a replacement laptop to sell to the customer in exchange.
            </p>
            <div>
              <label className="flabel">Replacement laptop</label>
              <select value={selectedLaptop} onChange={(e) => setSelectedLaptop(e.target.value)} className="field mt-1.5">
                <option value="">— Select laptop —</option>
                {laptops.map((l) => (
                  <option key={l.id} value={l.id}>{l.brand_model} · {l.serial_number}</option>
                ))}
              </select>
              {laptops.length === 0 && !busy && (
                <p className="mt-1 text-xs text-ink-faint">No In Stock laptops available at this store.</p>
              )}
            </div>
            <div>
              <label className="flabel">Exchange sale price (₹)</label>
              <input type="number" min="0" step="any" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} placeholder="Enter the new sale price" className="field mt-1.5" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => { setStep('choose'); setError(''); setSelectedLaptop(''); setSalePrice(''); }} className="btn-ghost">Back</button>
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
