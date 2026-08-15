import React, { useState } from 'react';
import { formatTime, inr } from '../utils';
import { useLabels } from '../labels.jsx';
import StatusChip from './StatusChip';

export default function LaptopTable({
  laptops, stores, onTransfer, onEdit, onDelete, onSell,
  canEdit = true, canTransfer = true, canSell = false, canManageCustomers = false, rowId, showSensitive = false, onDetail
}) {
  const [detailLaptopId, setDetailLaptopId] = useState(null);
  const [adminDetailId, setAdminDetailId] = useState(null);

  const toggleDetail = (laptopId) => {
    setDetailLaptopId(prev => prev === laptopId ? null : laptopId);
  };
  const toggleAdminDetail = (laptopId) => {
    setAdminDetailId(prev => prev === laptopId ? null : laptopId);
  };
  const maskAadhar = (hash) => (hash && hash.length > 6 ? `••••••${hash.slice(-6)}` : hash || '—');
  const t = useLabels();
  const [pending, setPending] = useState({}); // { laptopId: toStoreId }

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
    await onSell?.(laptop);
  };

  const th = 'px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint';
  const td = 'px-4 py-3 align-middle';

  return (
    <div className="panel overflow-hidden">
      <div className="hidden md:block overflow-x-auto">
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
              const spec = [l.product_line, l.ram, l.processor_type, l.storage_size, l.storage_type].filter(Boolean).join(' · ');
              const gfx = l.graphics === 'yes' ? `GPU: ${l.graphics_type || '—'}${l.graphics_model ? ` ${l.graphics_model}` : ''}` : '';
               const isSold = l.status === 'Sold';
               return (
                 <React.Fragment key={l.id}>
                   <tr className="group transition-colors duration-150 hover:bg-surface-2/60" data-row={rowId ? rowId(l) : undefined}>
                   <td className={td}>
                     <p className="font-medium text-ink">{l.brand_model}</p>
{l.purchased_from && (
                        <p className="mt-0.5 text-[11px] text-ink-faint">From {l.purchased_from}</p>
                      )}
                    </td>
                   <td className={`${td} text-xs text-ink-dim`}>
                     <p>{spec || '—'}</p>
                     {gfx && <p className="mt-0.5 text-[11px] text-ink-faint">{gfx}</p>}
                     {l.purchase_comment && (
                       <p className="mt-0.5 max-w-[260px] truncate text-[11px] text-ink-faint" title={l.purchase_comment}>
                         {l.purchase_comment}
                       </p>
                     )}
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
                            className="btn-accent"
                          >
                            {t.sellButton || 'Sell'}
                          </button>
                        )}
                        {isSold && (
                          <button
                            onClick={() => toggleDetail(l.id)}
                            className="btn-ghost text-accent"
                            title="View customer details"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l3 3m0 0l-3-3m3 3H10" />
                            </svg>
                          </button>
                        )}
                        {showSensitive && (
                          <button
                            onClick={() => toggleAdminDetail(l.id)}
                            className="btn-ghost text-accent"
                            title="View purchase / inventory details"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </button>
                        )}
                      </div>
                   </td>
                 </tr>
                 {adminDetailId === l.id && (
                   <tr className="bg-surface-2/50">
                     <td colSpan={8} className="px-4 py-2 text-sm text-ink-dim">
                       <div className="p-3 rounded-lg border border-accent-line bg-accent-soft">
                         <p className="font-semibold text-ink mb-2">Purchase / Inventory Details</p>
                         <div className="grid gap-x-6 gap-y-1 text-[11px] sm:grid-cols-2 lg:grid-cols-3">
                           <p><span className="text-ink-faint">Aadhar (last 6):</span> <span className="font-mono text-ink">{maskAadhar(l.purchaser_aadhar_hash)}</span></p>
                           <p><span className="text-ink-faint">Purchase comment:</span> {l.purchase_comment || '—'}</p>
                           <p><span className="text-ink-faint">Charger:</span> {l.charger || '—'}</p>
                           <p><span className="text-ink-faint">Added:</span> {formatTime(l.created_at)}</p>
                           <p><span className="text-ink-faint">Purchased from:</span> {l.purchased_from || '—'}</p>
                           <p><span className="text-ink-faint">Purchase rate:</span> {l.purchase_rate != null ? inr(l.purchase_rate) : '—'}{l.extra_charges ? ` + ${inr(l.extra_charges)}` : ''}</p>
                         </div>
                         <button
                           onClick={() => setAdminDetailId(null)}
                           className="mt-3 text-accent underline cursor-pointer"
                         >
                           Close
                         </button>
                       </div>
                     </td>
                   </tr>
                 )}
                 {detailLaptopId === l.id && (
                   <tr className="bg-surface-2/50">
                     <td colSpan={8} className="px-4 py-2 text-sm text-ink-dim">
                       <div className="p-3 rounded-lg border border-accent-line bg-accent-soft">
                         <p className="font-semibold text-ink mb-2">Customer Details</p>
                         <p className="text-[10px] text-ink-faint mb-1">
                           {l.sale_customer_name || '— no customer linked —'}
                         </p>
                         {l.sold_at && (
                           <p className="text-[10px] text-ink-faint">
                             Sold on {formatTime(l.sold_at)}
                           </p>
                         )}
                         {l.sold_by && (
                           <p className="text-[10px] text-ink-faint">
                             Sold by {l.sold_by}
                           </p>
                         )}
                         <button
                           onClick={() => setDetailLaptopId(null)}
                           className="mt-3 text-accent underline cursor-pointer"
                         >
                           Close
                         </button>
                       </div>
                     </td>
                   </tr>
                 )}
                 {isSold && (
                   <tr className="bg-surface-2/30">
                     <td colSpan={8} className="px-4 py-1.5 text-xs text-ink-dim">
                       <span className="inline-flex items-center gap-1.5">
                         <span className="mono-chip text-[10px]">{l.serial_number}</span>
                         <span>Sold for </span>
                         <span className="font-medium text-ink">{inr(l.sale_price)}</span>
                         <span> to </span>
                         <span className="font-medium text-ink">
                           {l.sale_customer_name || '— no customer linked —'}
                         </span>
                         {l.sold_at && (
                           <span className="text-ink-faint">
                             on {formatTime(l.sold_at)}
                           </span>
                         )}
                         {l.sold_by && (
                           <span className="text-ink-faint">
                             by {l.sold_by}
                           </span>
                         )}
                       </span>
                     </td>
                   </tr>
                 )}
                 </React.Fragment>
               );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: card boxes instead of a scrolling table */}
      <div className="md:hidden divide-y divide-[var(--hairline)]">
        {laptops.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-ink-faint">{t.noLaptops}</div>
        )}
        {laptops.map((l) => {
          const sel = pending[l.id] ?? '';
          const spec = [l.product_line, l.ram, l.processor_type, l.storage_size, l.storage_type].filter(Boolean).join(' · ');
          const gfx = l.graphics === 'yes' ? `GPU: ${l.graphics_type || '—'}${l.graphics_model ? ` ${l.graphics_model}` : ''}` : '';
          const isSold = l.status === 'Sold';
          return (
            <div key={l.id} className="px-4 py-3" data-row={rowId ? rowId(l) : undefined}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{l.brand_model}</p>
                  {l.purchased_from && (
                    <p className="mt-0.5 text-[11px] text-ink-faint">From {l.purchased_from}</p>
                  )}
                </div>
                <StatusChip status={l.status} />
              </div>
              {spec && <p className="mt-1.5 text-xs text-ink-dim">{spec}</p>}
              {gfx && <p className="mt-0.5 text-[11px] text-ink-faint">{gfx}</p>}
              {l.purchase_comment && (
                <p className="mt-0.5 text-[11px] text-ink-faint">{l.purchase_comment}</p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <span className="mono-chip">{l.serial_number}</span>
                <span className="text-ink-dim">
                  {l.current_store_name ?? <span className="text-ink-faint">{t.unassigned}</span>}
                </span>
                {l.purchase_rate != null && (
                  <span className="font-mono text-ink-dim">
                    {inr(l.purchase_rate)}
                    {l.extra_charges ? `+${inr(l.extra_charges)}` : ''}
                  </span>
                )}
              </div>
              {isSold && (
                <div className="mt-2 rounded-lg bg-surface-2/60 px-2.5 py-1.5 text-[11px] text-ink-dim">
                  Sold for <span className="font-medium text-ink">{inr(l.sale_price)}</span> to{' '}
                  <span className="font-medium text-ink">
                    {l.sale_customer_name || '— no customer linked —'}
                  </span>
                  {l.sold_at && <> on {formatTime(l.sold_at)}</>}
                  {l.sold_by && <> by {l.sold_by}</>}
                </div>
              )}
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                {canTransfer && !isSold && (
                  <>
                    <select
                      value={sel}
                      onChange={(e) => setPending({ ...pending, [l.id]: e.target.value })}
                      className="min-w-[130px] flex-1 rounded-lg border border-line bg-surface-2 px-2 py-1.5 font-mono text-xs text-ink-dim focus:border-accent-line focus:outline-none"
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
                  </>
                )}
                {!canTransfer &&
                  (isSold ? (
                    <span className="text-[11px] text-ink-faint">Sold</span>
                  ) : (
                    <span className="text-[11px] text-ink-faint">{t.viewOnly}</span>
                  ))}
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  {canEdit && (
                    <>
                      <button onClick={() => onEdit?.(l)} className="btn-ghost">
                        {t.editButton}
                      </button>
                      <button onClick={() => onDelete?.(l.id, l.brand_model)} className="btn-danger">
                        {t.deleteButton}
                      </button>
                    </>
                  )}
                  {canSell && !isSold && (
                    <button onClick={() => handleSell(l)} className="btn-accent">
                      {t.sellButton || 'Sell'}
                    </button>
                  )}
                  {isSold && (
                    <button
                      onClick={() => toggleDetail(l.id)}
                      className="btn-ghost text-accent"
                      title="View customer details"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l3 3m0 0l-3-3m3 3H10" />
                      </svg>
                    </button>
                  )}
                  {showSensitive && (
                    <button
                      onClick={() => toggleAdminDetail(l.id)}
                      className="btn-ghost text-accent"
                      title="View purchase / inventory details"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
              {adminDetailId === l.id && (
                <div className="mt-2 rounded-lg border border-accent-line bg-accent-soft p-3 text-[11px] text-ink-dim">
                  <p className="font-semibold text-ink mb-1.5">Purchase / Inventory Details</p>
                  <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                    <p><span className="text-ink-faint">Aadhar (last 6):</span> <span className="font-mono text-ink">{maskAadhar(l.purchaser_aadhar_hash)}</span></p>
                    <p><span className="text-ink-faint">Charger:</span> {l.charger || '—'}</p>
                    <p><span className="text-ink-faint">Purchase comment:</span> {l.purchase_comment || '—'}</p>
                    <p><span className="text-ink-faint">Purchased from:</span> {l.purchased_from || '—'}</p>
                    <p><span className="text-ink-faint">Added:</span> {formatTime(l.created_at)}</p>
                    <p><span className="text-ink-faint">Purchase rate:</span> {l.purchase_rate != null ? inr(l.purchase_rate) : '—'}{l.extra_charges ? ` + ${inr(l.extra_charges)}` : ''}</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}