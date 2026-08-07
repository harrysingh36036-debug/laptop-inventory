import { useState } from 'react';
import { STATUS_STYLES, formatTime } from '../utils';
import { useLabels } from '../labels.jsx';

export default function LaptopTable({
  laptops, stores, onTransfer, onEdit, onDelete, onSell,
  canEdit = true, canTransfer = true, canSell = false
}) {
  const t = useLabels();
  const [pending, setPending] = useState({}); // { laptopId: toStoreId }
  const [sellBusy, setSellBusy] = useState(null);

  const handleConfirm = (laptop) => {
    const to = pending[laptop.id];
    if (!to || String(to) === String(laptop.current_store_id)) {
      delete pending[laptop.id];
      setPending({ ...pending });
      return;
    }
    onTransfer(laptop.id, Number(to));
  };

  const handleSell = async (laptop) => {
    const price = window.prompt(
      `Selling ${laptop.brand_model} (${laptop.serial_number})\nEnter sale price:`,
      laptop.purchase_rate ? String(Math.round(Number(laptop.purchase_rate) * 1.2)) : ''
    );
    if (price == null) return;
    setSellBusy(laptop.id);
    await onSell?.(laptop, Number(price));
    setSellBusy(null);
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">{t.tableBrand}</th>
              <th className="px-4 py-3 font-semibold">Specs</th>
              <th className="px-4 py-3 font-semibold">{t.tableSerial}</th>
              <th className="px-4 py-3 font-semibold">{t.tableStore}</th>
              <th className="px-4 py-3 font-semibold">{t.tableStatus}</th>
              <th className="px-4 py-3 font-semibold">Purchase</th>
              <th className="px-4 py-3 font-semibold">{t.tableChangeLocation}</th>
              <th className="px-4 py-3 font-semibold">{t.tableActions}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {laptops.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                  {t.noLaptops}
                </td>
              </tr>
            )}
            {laptops.map((l) => {
              const sel = pending[l.id] ?? '';
              const spec = [l.processor_type, l.generation, l.storage_type].filter(Boolean).join(' · ');
              const gfx = l.graphics === 'yes' ? ` · GPU: ${l.graphics_type || '—'}${l.graphics_model ? ` ${l.graphics_model}` : ''}` : '';
              return (
                <tr key={l.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{l.brand_model}</p>
                    {l.purchased_from && (
                      <p className="text-[11px] text-slate-400">{l.purchased_from}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    <p>{spec || '—'}</p>
                    <p>{gfx}</p>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{l.serial_number}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {l.current_store_name ?? (
                      <span className="text-slate-400">{t.unassigned}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${STATUS_STYLES[l.status]}`}
                    >
                      {l.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {l.purchase_rate != null
                      ? `₹${Number(l.purchase_rate).toLocaleString('en-IN')}${l.extra_charges ? ` +${Number(l.extra_charges).toLocaleString('en-IN')}` : ''}`
                      : '—'}
                  </td>
                  {canTransfer && l.status !== 'Sold' ? (
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={sel}
                          onChange={(e) => setPending({ ...pending, [l.id]: e.target.value })}
                          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs focus:border-slate-500 focus:outline-none"
                        >
                          <option value="">{t.selectStore}</option>
                          {stores
                            .filter((s) => s.id !== l.current_store_id)
                            .map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.store_name}
                              </option>
                            ))}
                        </select>
                        <button
                          onClick={() => handleConfirm(l)}
                          disabled={!sel}
                          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {t.transferButton}
                        </button>
                      </div>
                    </td>
                  ) : (
                    <td className="px-4 py-3 text-xs text-slate-400">{l.status === 'Sold' ? 'Sold' : t.viewOnly}</td>
                  )}
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {canEdit && (
                        <>
                          <button
                            onClick={() => onEdit?.(l)}
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                          >
                            {t.editButton}
                          </button>
                          <button
                            onClick={() => onDelete?.(l.id, l.brand_model)}
                            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                          >
                            {t.deleteButton}
                          </button>
                        </>
                      )}
                      {canSell && l.status !== 'Sold' && (
                        <button
                          onClick={() => handleSell(l)}
                          disabled={sellBusy === l.id}
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                        >
                          {sellBusy === l.id ? '…' : 'Sell'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}