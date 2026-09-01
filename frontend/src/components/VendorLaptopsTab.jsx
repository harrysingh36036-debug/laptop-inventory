import { useEffect, useState, useMemo } from 'react';
import { getLaptops, updateLaptop, createLaptop, deleteLaptop } from '../api';
import { useLabels } from '../labels.jsx';
import SearchBox from './SearchBox';
import InventoryModal from './InventoryModal';
import ReturnToVendorModal from './ReturnToVendorModal';
import DangerConfirmModal from './DangerConfirmModal';
import { inr, formatTime, formatIstDate } from '../utils';

const VendorLaptopsTab = ({ stores, vendors, brands = [], isAdmin, isSuperAdmin = false, onNotify, onRefresh }) => {
  const [laptops, setLaptops] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [productLine, setProductLine] = useState('');
  const [returnTarget, setReturnTarget] = useState(null);
  const [assignTarget, setAssignTarget] = useState(null);
  const [assignStore, setAssignStore] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const { t } = useLabels();

  const productLines = [...new Set(laptops.map((l) => l.product_line).filter(Boolean))].sort();

  const handleInvSave = async (payload) => {
    try {
      await createLaptop({ ...payload, current_store_id: null });
      setShowModal(false);
      onNotify?.('Laptop added to vendor list', 'success');
      await onRefresh();
      refreshLaptops();
    } catch (err) {
      return err.message || 'Failed to add laptop';
    }
  };

  useEffect(() => {
    refreshLaptops();
  }, [search, selectedVendor, minPrice, maxPrice]);

  const refreshLaptops = async () => {
    setLaptops(await getLaptops());
  };

  const vendorName = selectedVendor != null ? vendors.find((v) => v.id === selectedVendor)?.name : null;

  const filtered = useMemo(() => {
    const text = search.trim().toLowerCase();
    const min = minPrice === '' ? null : Number(minPrice);
    const max = maxPrice === '' ? null : Number(maxPrice);
    return (laptops || []).filter((l) => {
      if (l.current_store_id != null) return false;
      if (vendorName && l.purchased_from !== vendorName) return false;
      const rate = Number(l.purchase_rate) || 0;
      if (min != null && rate < min) return false;
      if (max != null && rate > max) return false;
      if (productLine && (l.product_line || '') !== productLine) return false;
      const created = (l.created_at || '').slice(0, 10);
      if (fromDate && created && created < fromDate) return false;
      if (toDate && created && created > toDate) return false;
      if (text) {
        const hay = [
          l.brand, l.brand_model, l.serial_number, l.processor_type, l.ram,
          l.generation, l.storage_type, l.storage_size, l.current_store_name, l.purchased_from
        ].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(text)) return false;
      }
      return true;
    });
  }, [laptops, search, vendorName, minPrice, maxPrice, productLine, fromDate, toDate]);

  const handleAddLaptop = async (laptop) => {
    setAssignTarget(laptop);
    setAssignStore('');
  };

  const confirmAssign = async () => {
    if (!assignTarget || !assignStore) return;
    try {
      await updateLaptop(assignTarget.id, { current_store_id: Number(assignStore) });
      onNotify?.('Laptop added to inventory', 'success');
      setAssignTarget(null);
      setAssignStore('');
      await onRefresh();
      refreshLaptops();
    } catch (err) {
      onNotify?.(err.message, 'error');
    }
  };

  const clearAll = () => {
    setSelectedVendor(null);
    setMinPrice('');
    setMaxPrice('');
    setFromDate('');
    setToDate('');
    setProductLine('');
    setSearch('');
  };

  const handleDeleteVendorLaptop = async (pwd, remarks) => {
    const l = deleteTarget;
    if (!l) return '';
    try {
      await deleteLaptop(l.id, pwd, remarks);
      onNotify?.('Vendor laptop deleted', 'success');
      setDeleteTarget(null);
      await onRefresh();
      refreshLaptops();
      return '';
    } catch (e) {
      return e.message;
    }
  };

  const activeFilterCount = [selectedVendor, minPrice, maxPrice, fromDate, toDate, productLine].filter(Boolean).length;

  return (
    <div className="space-y-4 md:space-y-6 pb-20 md:pb-6">
      <section className="px-4 md:px-0 pt-4 md:pt-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold tracking-tight text-ink">
              {t?.tableVendorLaptops || 'Vendor Laptops'}
            </h2>
            <p className="text-xs text-ink-faint">
              {filtered.length} laptops — track by serial, config & price
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isAdmin && (
              <button onClick={() => setShowModal(true)} className="btn-accent text-xs md:text-sm">
                + Add
              </button>
            )}
            {isAdmin && activeFilterCount > 0 && (
              <button onClick={clearAll} className="btn-ghost text-xs md:text-sm">
                Clear
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="px-4 md:px-0">
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Search brand, model, serial, config..."
          countLabel={`${filtered.length} laptops`}
        />
      </div>

      <div className="px-4 md:px-0">
        <button
          onClick={() => setFiltersOpen(!filtersOpen)}
          className="flex items-center gap-2 text-xs font-medium text-ink-dim md:hidden"
        >
          <svg className={`h-4 w-4 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
          Filters
          {activeFilterCount > 0 && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">{activeFilterCount}</span>
          )}
        </button>
        <div className={`${filtersOpen ? 'mt-3 space-y-3' : 'hidden'} md:block md:space-y-0 md:grid md:grid-cols-2 lg:grid-cols-4 md:gap-4`}>
          <div>
            <h3 className="font-semibold text-[10px] uppercase tracking-wider text-ink-faint">Vendor</h3>
            <select
              value={selectedVendor ?? ''}
              onChange={(e) => {
                const val = e.target.value === '' ? null : Number(e.target.value);
                setSelectedVendor(val);
                setSearch('');
                setMinPrice('');
                setMaxPrice('');
                refreshLaptops();
              }}
              className="field w-full mt-1"
            >
              <option value="">All Vendors</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>
          <div>
            <h3 className="font-semibold text-[10px] uppercase tracking-wider text-ink-faint">Price Range</h3>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <input type="number" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} placeholder="Min ₹" className="field text-sm" />
              <input type="number" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="Max ₹" className="field text-sm" />
            </div>
          </div>
          <div>
            <h3 className="font-semibold text-[10px] uppercase tracking-wider text-ink-faint">Product Line</h3>
            <select value={productLine} onChange={(e) => setProductLine(e.target.value)} className="field w-full mt-1">
              <option value="">All</option>
              {productLines.map((pl) => (
                <option key={pl} value={pl}>{pl}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <h3 className="font-semibold text-[10px] uppercase tracking-wider text-ink-faint">From</h3>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="field w-full mt-1" />
            </div>
            <div>
              <h3 className="font-semibold text-[10px] uppercase tracking-wider text-ink-faint">To</h3>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="field w-full mt-1" />
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-0 hidden md:block">
        <div className="panel p-5">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{t?.tableBrand || 'Brand'}</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{t?.tableModel || 'Model'}</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{t?.tableSerial || 'Serial'}</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{t?.tableConfig || 'Config'}</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{t?.tablePurchaseRate || 'Rate'}</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{t?.tablePurchasedFrom || 'Vendor'}</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Purchase Date</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Status</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--hairline)]">
                {filtered.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-12 text-center text-sm text-ink-faint">{t?.noLaptops || 'No laptops found'}</td></tr>
                )}
                {filtered.map((l) => {
                  const config = [l.ram, l.storage_type, l.processor_type, l.generation].filter(Boolean).join(' · ');
                  return (
                    <tr key={l.id} className="group transition-colors duration-150 hover:bg-surface-2/60">
                      <td className="px-4 py-3 font-medium text-ink">{l.brand || '—'}</td>
                      <td className="px-4 py-3">{l.brand_model || '—'}</td>
                      <td className="px-4 py-3"><span className="mono-chip">{l.serial_number}</span></td>
                      <td className="px-4 py-3 text-[10px] text-ink-dim">{config || '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs text-ink-dim">{l.purchase_rate != null ? inr(l.purchase_rate) : '—'}</td>
                      <td className="px-4 py-3 text-ink-dim">{l.purchased_from || '—'}</td>
                      <td className="px-4 py-3 font-mono text-[11px] text-ink-faint">{l.created_at ? formatIstDate(String(l.created_at).slice(0, 10)) : '—'}</td>
                      <td className="px-4 py-3"><span className={l.status === 'Sold' ? 'text-stock-risk' : 'status-chip'}>{l.status || '—'}</span></td>
                      <td className="px-4 py-3 text-right">
                        {isAdmin && (
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => handleAddLaptop(l)} className="btn-ghost text-accent text-xs">Add to Inventory</button>
                            <button onClick={() => setReturnTarget(l)} className="btn-ghost text-stock-risk text-xs">Return</button>
                            {isSuperAdmin && (
                              <button onClick={() => setDeleteTarget(l)} className="btn-ghost text-stock-risk text-xs" title="Super admin delete">Delete</button>
                            )}
                          </div>
                        )}
                        {isSuperAdmin && !isAdmin && (
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => setDeleteTarget(l)} className="btn-ghost text-stock-risk text-xs" title="Super admin delete">Delete</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-line bg-surface-2/40">
                  <td className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-ink-faint" colSpan={3}>Total</td>
                  <td className="px-4 py-2.5 font-mono text-xs font-semibold text-ink">{inr(filtered.reduce((s, l) => s + (Number(l.purchase_rate) || 0), 0))}</td>
                  <td colSpan={5}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      <div className="px-4 md:hidden space-y-2">
        {filtered.length === 0 && (
          <p className="text-center text-sm text-ink-faint py-6">{t?.noLaptops || 'No laptops found'}</p>
        )}
        {filtered.map((l) => {
          const config = [l.ram, l.storage_type, l.processor_type, l.generation].filter(Boolean).join(' · ');
          return (
            <div key={l.id} className="rounded-xl border border-line bg-surface-2/40 p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink text-sm truncate">{l.brand_model || l.brand || '—'}</p>
                  <p className="text-[10px] text-ink-dim mt-0.5 truncate">{l.serial_number || '—'}</p>
                </div>
                <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${l.status === 'Sold' ? 'bg-stock-risk/10 text-stock-risk' : 'bg-accent/10 text-accent'}`}>
                  {l.status || '—'}
                </span>
              </div>
              {config && <p className="text-[10px] text-ink-faint truncate">{config}</p>}
              <div className="flex items-center justify-between text-[10px] text-ink-dim pt-1 border-t border-line">
                <span>{l.purchase_rate != null ? inr(l.purchase_rate) : '—'}</span>
                <span className="truncate max-w-[120px]">{l.purchased_from || '—'}</span>
                <span className="font-mono">{l.created_at ? formatIstDate(String(l.created_at).slice(0, 10)) : '—'}</span>
              </div>
              {isAdmin && (
                <div className="flex items-center gap-2 mt-1">
                  <button onClick={() => handleAddLaptop(l)} className="flex-1 btn-ghost text-[10px] text-accent">
                    + Add to Inventory
                  </button>
                  <button onClick={() => setReturnTarget(l)} className="flex-1 btn-ghost text-[10px] text-stock-risk">
                    Return
                  </button>
                  {isSuperAdmin && (
                    <button onClick={() => setDeleteTarget(l)} className="flex-1 btn-ghost text-[10px] text-stock-risk">
                      Delete
                    </button>
                  )}
                </div>
              )}
              {isSuperAdmin && !isAdmin && (
                <div className="flex items-center gap-2 mt-1">
                  <button onClick={() => setDeleteTarget(l)} className="flex-1 btn-ghost text-[10px] text-stock-risk">
                    Delete
                  </button>
                </div>
              )}
            </div>
          );
        })}
        <div className="flex items-center justify-between rounded-lg bg-surface-2/50 px-3 py-2 mt-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Total</span>
          <span className="font-mono text-xs font-semibold text-ink">{inr(filtered.reduce((s, l) => s + (Number(l.purchase_rate) || 0), 0))}</span>
        </div>
      </div>

      {isAdmin && showModal && (
        <InventoryModal
          stores={stores}
          brands={brands}
          vendors={vendors}
          productLines={productLines}
          editing={null}
          title="Add Vendor Laptop"
          vendorSelect
          onSave={handleInvSave}
          onClose={() => setShowModal(false)}
        />
      )}

      {isAdmin && assignTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-pop">
            <h3 className="font-display text-base font-semibold tracking-tight text-ink">Add to Inventory</h3>
            <p className="mt-2 text-sm text-ink-dim">
              Assign <strong>{assignTarget.brand_model || assignTarget.brand}</strong> ({assignTarget.serial_number}) to a store.
            </p>
            <div className="mt-4">
              <label className="flabel">Select Store</label>
              <select value={assignStore} onChange={(e) => setAssignStore(e.target.value)} className="field mt-1.5 w-full">
                <option value="">— Choose store —</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>{s.store_name}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => { setAssignTarget(null); setAssignStore(''); }} className="btn-ghost">Cancel</button>
              <button onClick={confirmAssign} disabled={!assignStore} className="btn-accent disabled:opacity-50">Confirm</button>
            </div>
          </div>
        </div>
      )}

      {isAdmin && returnTarget && (
        <ReturnToVendorModal
          laptop={returnTarget}
          onNotify={onNotify}
          onClose={() => { setReturnTarget(null); refreshLaptops(); onRefresh?.(); }}
        />
      )}

      {deleteTarget && isSuperAdmin && (
        <DangerConfirmModal
          title="Delete this vendor laptop?"
          warning={`"${deleteTarget.brand_model || deleteTarget.brand || '#' + deleteTarget.id}" (${deleteTarget.serial_number}) will be permanently removed from the vendor pool. This cannot be undone.`}
          onConfirm={handleDeleteVendorLaptop}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
};

export default VendorLaptopsTab;
