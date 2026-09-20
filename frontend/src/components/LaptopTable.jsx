import React, { useState } from 'react';
import { formatTime, formatIstDateTime, inr } from '../utils';
import { useLabels } from '../labels.jsx';
import StatusChip from './StatusChip';

export default function LaptopTable({
  laptops, stores, onTransfer, onEdit, onDelete, onSell,
  canEdit = true, canTransfer = true, canSell = false, canManageCustomers = false, rowId, showSensitive = false, onDetail, sellStoreId = null
}) {
  const [detailLaptopId, setDetailLaptopId] = useState(null);
  const [adminDetailId, setAdminDetailId] = useState(null);
  const [revealedAadhars, setRevealedAadhars] = useState(new Set());

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

  const th = 'px-2.5 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap';
  const td = 'px-2.5 py-2.5 align-middle whitespace-nowrap';

  return (
    <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full min-w-[1050px] border-collapse text-left text-[13px]">
          <thead>
            <tr className="border-b border-gray-200">
              <th className={th}>{t.tableBrand}</th>
              <th className={th}>{t.colSpecs || 'Specs'}</th>
              <th className={th}>{t.tableSerial}</th>
              <th className={th}>{t.tableStore}</th>
              <th className={th}>{t.tableStatus}</th>
              <th className={th}>Condition</th>
              <th className={th}>{t.colPurchase || 'Purchase'}</th>
              <th className={th}>{t.colPurchaseDate || 'Purchase Date · IST'}</th>
              <th className={th}>{t.tableChangeLocation}</th>
              <th className={`${th} text-right`}>{t.tableActions}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {laptops.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-sm text-gray-500">
                  {t.noLaptops}
                </td>
              </tr>
            )}
            {laptops.map((l) => {
              const sel = pending[l.id] ?? '';
const spec = [l.processor_type, l.generation, l.ram, l.storage_size ? `${l.storage_size} ${l.storage_type || ''}`.trim() : l.storage_type].filter(Boolean).join(' · ');
              const gfx = l.graphics === 'yes' ? `GPU: ${l.graphics_type || '—'}${l.graphics_model ? ` ${l.graphics_model}` : ''}` : '';
               const isSold = l.status === 'Sold';
               const canSellRow = canSell && !isSold && (sellStoreId == null || String(l.current_store_id) === String(sellStoreId));
               return (
                 <React.Fragment key={l.id}>
                   <tr className="group transition-colors duration-150 hover:bg-gray-50" data-row={rowId ? rowId(l) : undefined}>
                   <td className={td}>
                     <p className="font-medium text-gray-900">{l.brand}{l.product_line ? ` ${l.product_line}` : ''}</p>
                     {l.brand_model && l.brand_model !== l.product_line && (
                       <p className="mt-0.5 text-[11px] text-gray-500">{l.brand_model}</p>
                     )}
{l.purchased_from && (
                        <p className="mt-0.5 text-[11px] text-gray-500">From {l.purchased_from}</p>
                      )}
                    </td>
                   <td className={`${td} text-xs text-gray-600`}>
                     <p>{spec || '—'}</p>
{gfx && <p className="mt-0.5 text-[11px] text-gray-500 truncate max-w-[180px]">{gfx}</p>}
                     {l.purchase_comment && (
                       <p className="mt-0.5 max-w-[260px] truncate text-[11px] text-gray-500" title={l.purchase_comment}>
                         {l.purchase_comment}
                       </p>
                     )}
                   </td>
                    <td className={td}>
                      <span className="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-1 py-0.5 font-mono text-[10px] text-gray-600">{l.serial_number}</span>
                    </td>
                   <td className={td}>
                     {l.current_store_name ?? (
                       <span className="text-gray-500">{t.unassigned}</span>
                     )}
                   </td>
                    <td className={td}>
                      <StatusChip status={l.status} />
                    </td>
                    <td className={`${td} text-xs text-gray-600`}>
                      {l.condition || 'Good'}
                    </td>
                    <td className={`${td} font-mono text-xs text-gray-600`}>
                      {l.purchase_rate != null
                        ? `${inr(l.purchase_rate)}${l.extra_charges ? `+${inr(l.extra_charges)}` : ''}`
                        : '—'}
                    </td>
                    <td className={`${td} font-mono text-[10px] text-gray-500 whitespace-nowrap`}>{l.created_at ? formatIstDateTime(l.created_at) : '—'}</td>
                    {canTransfer && !isSold ? (
                      <td className={td}>
                        <div className="flex items-center gap-1.5">
                          <select
                            value={sel}
                            onChange={(e) => setPending({ ...pending, [l.id]: e.target.value })}
                            className="w-[110px] rounded-lg border border-gray-200 bg-gray-50 px-1.5 py-1 text-[11px] text-gray-600 focus:border-blue-200 focus:outline-none"
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
                           className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                         >
                           {t.transferButton}
                         </button>
                       </div>
                     </td>
                   ) : (
                      <td className={`${td} text-xs text-gray-500`}>
                        {isSold ? (t.soldRow || 'Sold') : t.viewOnly}
                      </td>
                   )}
                    <td className={`${td} text-right`}>
                      <div className="flex items-center justify-end gap-1">
                       {canEdit && (
                         <>
                           <button onClick={() => onEdit?.(l)} className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-100">
                             {t.editButton}
                           </button>
                           <button
                             onClick={() => onDelete?.(l.id, l.brand_model)}
                             className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-100"
                           >
                             {t.deleteButton}
                           </button>
                         </>
                       )}
{canSellRow && (
                           <button
                             onClick={() => handleSell(l)}
                             className="rounded-lg bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-blue-700"
                           >
                             {t.sellButton || 'Sell'}
                           </button>
                         )}
                        {isSold && (
                          <button
                            onClick={() => toggleDetail(l.id)}
                            className="rounded-lg border border-gray-200 bg-gray-50 p-1.5 text-gray-600 hover:bg-gray-100 text-blue-600"
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
                            className="rounded-lg border border-gray-200 bg-gray-50 p-1.5 text-gray-600 hover:bg-gray-100 text-blue-600"
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
                    <tr className="bg-gray-50">
                      <td colSpan={10} className="px-4 py-2 text-sm text-gray-600">
                       <div className="p-3 rounded-lg border border-blue-200 bg-blue-50">
                          <p className="font-semibold text-gray-900 mb-2">{t.purchTitle || 'Purchase / Inventory Details'}</p>
                         <div className="grid gap-x-6 gap-y-1 text-[11px] sm:grid-cols-2 lg:grid-cols-3">
                             <p><span className="text-gray-500">{t.dAadhar || 'Aadhar:'}</span> <span className="font-mono text-gray-900">
                              {l.purchaser_aadhar && revealedAadhars.has(l.id)
                                ? l.purchaser_aadhar
                                : maskAadhar(l.purchaser_aadhar_hash)}
                                <button
                                  type="button"
                                  onClick={() => setRevealedAadhars((prev) => { const next = new Set(prev); next.has(l.id) ? next.delete(l.id) : next.add(l.id); return next; })}
                                  className="ml-1.5 text-gray-500 hover:text-blue-600 transition-colors inline align-middle"
                                  title={revealedAadhars.has(l.id) ? 'Hide Aadhar' : 'Show full Aadhar'}
                                >
                                  {revealedAadhars.has(l.id)
                                    ? <svg className="h-3.5 w-3.5 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                                    : <svg className="h-3.5 w-3.5 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>}
                                </button>
                            </span></p>
                            <p><span className="text-gray-500">{t.dPurchaserName || 'Purchaser name:'}</span> {l.purchaser_name || '—'}</p>
                            <p><span className="text-gray-500">{t.dPurchaserPhone || 'Purchaser phone:'}</span> {l.purchaser_phone || '—'}</p>
                            <p><span className="text-gray-500">{t.dProductLine || 'Product line:'}</span> {l.product_line || '—'}</p>
                            <p><span className="text-gray-500">{t.dPurchComment || 'Purchase comment:'}</span> {l.purchase_comment || '—'}</p>
                            <p><span className="text-gray-500">{t.dCharger || 'Charger:'}</span> {l.charger || '—'}</p>
                            <p><span className="text-gray-500">{t.dAdded || 'Added:'}</span> {formatTime(l.created_at)}</p>
                            <p><span className="text-gray-500">{t.dFrom || 'Purchased from:'}</span> {l.purchased_from || '—'}</p>
                            <p><span className="text-gray-500">{t.dRate || 'Purchase rate:'}</span> {l.purchase_rate != null ? inr(l.purchase_rate) : '—'}{l.extra_charges ? ` + ${inr(l.extra_charges)}` : ''}</p>
                         </div>
                          <button
                            onClick={() => setAdminDetailId(null)}
                            className="mt-3 text-blue-600 underline cursor-pointer"
                          >
                            {t.closeButton || 'Close'}
                          </button>
                       </div>
                     </td>
                   </tr>
                 )}
                  {detailLaptopId === l.id && (
                    <tr className="bg-gray-50">
                      <td colSpan={10} className="px-4 py-2 text-sm text-gray-600">
                       <div className="p-3 rounded-lg border border-blue-200 bg-blue-50">
                          <p className="font-semibold text-gray-900 mb-2">{t.custTitle || 'Customer Details'}</p>
                          <p className="text-[10px] text-gray-500 mb-1">
                            {l.sale_customer_name || (t.custNone || '— no customer linked —')}
                          </p>
                          {l.sold_at && (
                            <p className="text-[10px] text-gray-500">
                              {t.soldRow || 'Sold'} {t.soldOn || 'on'} {formatTime(l.sold_at)}
                            </p>
                          )}
                          {l.sold_by && (
                            <p className="text-[10px] text-gray-500">
                              {t.soldRow || 'Sold'} {t.soldBy || 'by'} {l.sold_by}
                            </p>
                          )}
                          <button
                            onClick={() => setDetailLaptopId(null)}
                            className="mt-3 text-blue-600 underline cursor-pointer"
                          >
                            {t.closeButton || 'Close'}
                          </button>
                       </div>
                     </td>
                   </tr>
                 )}
                  {isSold && (
                    <tr className="bg-gray-50">
                      <td colSpan={10} className="px-4 py-1.5 text-xs text-gray-600">
                       <span className="inline-flex items-center gap-1.5">
                          <span className="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[11px] text-gray-600 text-[10px]">{l.serial_number}</span>
                          <span>{t.soldFor || 'Sold for'} </span>
                          <span className="font-medium text-gray-900">{inr(l.sale_price)}</span>
                          <span> {t.soldTo || 'to'} </span>
                          <span className="font-medium text-gray-900">
                            {l.sale_customer_name || (t.custNone || '— no customer linked —')}
                          </span>
                          {l.sold_at && (
                            <span className="text-gray-500">
                              {t.soldOn || 'on'} {formatTime(l.sold_at)}
                            </span>
                          )}
                          {l.sold_by && (
                            <span className="text-gray-500">
                              {t.soldBy || 'by'} {l.sold_by}
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
      <div className="md:hidden divide-y divide-gray-100">
        {laptops.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-gray-500">{t.noLaptops}</div>
        )}
        {laptops.map((l) => {
          const sel = pending[l.id] ?? '';
          const spec = [l.processor_type, l.generation, l.ram, l.storage_size ? `${l.storage_size} ${l.storage_type || ''}`.trim() : l.storage_type].filter(Boolean).join(' · ');
          const gfx = l.graphics === 'yes' ? `GPU: ${l.graphics_type || '—'}${l.graphics_model ? ` ${l.graphics_model}` : ''}` : '';
          const isSold = l.status === 'Sold';
          const canSellRow = canSell && !isSold && (sellStoreId == null || String(l.current_store_id) === String(sellStoreId));
          return (
            <div key={l.id} className="px-4 py-3" data-row={rowId ? rowId(l) : undefined}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900">{l.brand}{l.product_line ? ` ${l.product_line}` : ''}</p>
                  {l.brand_model && l.brand_model !== l.product_line && (
                    <p className="mt-0.5 text-[11px] text-gray-500 truncate max-w-[200px]">{l.brand_model}</p>
                  )}
                  {l.purchased_from && (
                    <p className="mt-0.5 text-[11px] text-gray-500 truncate max-w-[150px]">From {l.purchased_from}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <StatusChip status={l.status} />
                  {l.condition && <span className="text-[10px] text-gray-500">· {l.condition}</span>}
                </div>
              </div>
              {spec && <p className="mt-1.5 text-xs text-gray-600 truncate max-w-[200px]">{spec}</p>}
              {gfx && <p className="mt-0.5 text-[11px] text-gray-500 truncate max-w-[180px]">{gfx}</p>}
              {l.purchase_comment && (
                <p className="mt-0.5 text-[11px] text-gray-500 truncate max-w-[260px]">{l.purchase_comment}</p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <span className="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[11px] text-gray-600">{l.serial_number}</span>
                <span className="text-gray-600">
                  {l.current_store_name ?? <span className="text-gray-500">{t.unassigned}</span>}
                </span>
                {l.purchase_rate != null && (
                  <span className="font-mono text-gray-600">
                    {inr(l.purchase_rate)}
                    {l.extra_charges ? `+${inr(l.extra_charges)}` : ''}
                  </span>
                )}
                <span className="font-mono text-[11px] text-gray-500 whitespace-nowrap">{l.created_at ? formatIstDateTime(l.created_at) : ''}</span>
              </div>
              {isSold && (
                <div className="mt-2 rounded-lg bg-gray-50 px-2.5 py-1.5 text-[11px] text-gray-600">
                  {t.soldFor || 'Sold for'} <span className="font-medium text-gray-900">{inr(l.sale_price)}</span> {t.soldTo || 'to'}{' '}
                  <span className="font-medium text-gray-900">
                    {l.sale_customer_name || (t.custNone || '— no customer linked —')}
                  </span>
                  {l.sold_at && <> {t.soldOn || 'on'} {formatTime(l.sold_at)}</>}
                  {l.sold_by && <> {t.soldBy || 'by'} {l.sold_by}</>}
                </div>
              )}
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                {canTransfer && !isSold && (
                  <>
                    <select
                      value={sel}
                      onChange={(e) => setPending({ ...pending, [l.id]: e.target.value })}
                      className="min-w-[130px] flex-1 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 font-mono text-xs text-gray-600 focus:border-blue-200 focus:outline-none"
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
                      className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {t.transferButton}
                    </button>
                  </>
                )}
                {!canTransfer &&
                  (isSold ? (
                    <span className="text-[11px] text-gray-500">{t.soldRow || 'Sold'}</span>
                  ) : (
                    <span className="text-[11px] text-gray-500">{t.viewOnly}</span>
                  ))}
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  {canEdit && (
                    <>
                      <button onClick={() => onEdit?.(l)} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100">
                        {t.editButton}
                      </button>
                      <button onClick={() => onDelete?.(l.id, l.brand_model)} className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100">
                        {t.deleteButton}
                      </button>
                    </>
                  )}
                  {canSellRow && (
                    <button onClick={() => handleSell(l)} className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
                      {t.sellButton || 'Sell'}
                    </button>
                  )}
                  {isSold && (
                    <button
                      onClick={() => toggleDetail(l.id)}
                      className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 text-blue-600"
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
                      className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 text-blue-600"
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
                <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-[11px] text-gray-600">
                  <p className="font-semibold text-gray-900 mb-1.5">{t.purchTitle || 'Purchase / Inventory Details'}</p>
                  <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                    <p><span className="text-gray-500">{t.dAadhar || 'Aadhar:'}</span> <span className="font-mono text-gray-900">
                      {l.purchaser_aadhar && revealedAadhars.has(l.id)
                        ? l.purchaser_aadhar
                        : maskAadhar(l.purchaser_aadhar_hash)}
                        <button
                          type="button"
                          onClick={() => setRevealedAadhars((prev) => { const next = new Set(prev); next.has(l.id) ? next.delete(l.id) : next.add(l.id); return next; })}
                          className="ml-1.5 text-gray-500 hover:text-blue-600 transition-colors inline align-middle"
                          title={revealedAadhars.has(l.id) ? 'Hide Aadhar' : 'Show full Aadhar'}
                        >
                          {revealedAadhars.has(l.id)
                            ? <svg className="h-3.5 w-3.5 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                            : <svg className="h-3.5 w-3.5 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>}
                        </button>
                    </span></p>
                    <p><span className="text-gray-500">{t.dPurchaserName || 'Purchaser name:'}</span> {l.purchaser_name || '—'}</p>
                    <p><span className="text-gray-500">{t.dPurchaserPhone || 'Purchaser phone:'}</span> {l.purchaser_phone || '—'}</p>
                    <p><span className="text-gray-500">{t.dProductLine || 'Product line:'}</span> {l.product_line || '—'}</p>
                    <p><span className="text-gray-500">{t.dCharger || 'Charger:'}</span> {l.charger || '—'}</p>
                    <p><span className="text-gray-500">{t.dPurchComment || 'Purchase comment:'}</span> {l.purchase_comment || '—'}</p>
                    <p><span className="text-gray-500">{t.dFrom || 'Purchased from:'}</span> {l.purchased_from || '—'}</p>
                    <p><span className="text-gray-500">{t.dAdded || 'Added:'}</span> {formatTime(l.created_at)}</p>
                    <p><span className="text-gray-500">{t.dRate || 'Purchase rate:'}</span> {l.purchase_rate != null ? inr(l.purchase_rate) : '—'}{l.extra_charges ? ` + ${inr(l.extra_charges)}` : ''}</p>
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