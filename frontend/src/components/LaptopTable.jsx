import { useState } from 'react';
import { formatTime, inr } from '../utils';
import { useLabels } from '../labels.jsx';
import StatusChip from './StatusChip';

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

  const th = 'px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint';
  const td = 'px-4 py-3 align-middle';

  return (
    <div className="panel overflow-hidden animate-rise">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className={th}>{t.tableBrand}</th>
              <th className={th}>Specs</th>
              <th className={th}>{t.tableSerial}</th>
              <th className={th}>{t.tableStore}</th>
              <th className={th}>{t.tableStatus}</th>
              <th className={th}>Purchase</th>
              <th className={th}>{t.tableChangeLocation}</th>
              <th className={`${th} text-right`}>{t.tableActions}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--hairline)]">
            {laptops.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-ink-faint">
                  {t.noLaptops}
                </td>
              </tr>
            )}
            {laptops.map((l) => {
              const sel = pending[l.id] ?? '';
              const spec = [l.processor_type, l.generation, l.storage_type].filter(Boolean).join(' · ');
              const gfx = l.graphics === 'yes' ? `GPU: ${l.graphics_type || '—'}${l.graphics_model ? ` ${l.graphics_model}` : ''}` : '';
              const isSold = l.status === 'Sold';
              return (
                <tr key={l.id} className="group transition-colors duration-150 hover:bg-surface-2/60">
                  <td className={td}>
                    <p className="font-medium text-ink">{l.brand_model}</p>
                    {l.purchased_from && (
                      <p className="mt-0.5 text-[11px] text-ink-faint">{l.purchased_from}</p>
                    )}
                  </td>
                  <td className={`${td} text-xs text-ink-dim`}>
                    <p>{spec || '—'}</p>
                    {gfx && <p className="mt-0.5 text-[11px] text-ink-faint">{gfx}</p>}
                  </td>
                  <td className={td}>
                    <span className="mono-chip">{l.serial_number}</span>
                  </td>
                  <td className={td}>
                    {l.current_store_name ?? (
                      <span className="text-ink-faint">{t.unassigned}</span>
                    )}
                  </td>
                  <td className={td}>
                    <StatusChip status={l.status} />
                  </td>
                  <td className={`${td} font-mono text-xs text-ink-dim`}>
                    {l.purchase_rate != null
                      ? `${inr(l.purchase_rate)}${l.extra_charges ? `+${inr(l.extra_charges)}` : ''}`
                      : '—'}
                  </td>
                  {canTransfer && !isSold ? (
                    <td className={td}>
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={sel}
                          onChange={(e) => setPending({ ...pending, [l.id]: e.target.value })}
                          className="rounded-lg border border-line bg-surface-2 px-2 py-1.5 font-mono text-xs text-ink-dim focus:border-accent-line focus:outline-none"
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
                          className="btn-ghost disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {t.transferButton}
                        </button>
                      </div>
                    </td>
                  ) : (
                    <td className={`${td} text-xs text-ink-faint`}>
                      {isSold ? 'Sold' : t.viewOnly}
                    </td>
                  )}
                  <td className={`${td} text-right`}>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {canEdit && (
                        <>
                          <button onClick={() => onEdit?.(l)} className="btn-ghost">
                            {t.editButton}
                          </button>
                          <button
                            onClick={() => onDelete?.(l.id, l.brand_model)}
                            className="btn-danger"
                          >
                            {t.deleteButton}
                          </button>
                        </>
                      )}
                      {canSell && !isSold && (
                        <button
                          onClick={() => handleSell(l)}
                          disabled={sellBusy === l.id}
                          className="btn-accent disabled:opacity-50"
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