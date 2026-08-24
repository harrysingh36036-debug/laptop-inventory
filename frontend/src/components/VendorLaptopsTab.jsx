import { useEffect, useState, useMemo } from 'react';
import { getLaptops, createLaptop } from '../api';
import { useLabels } from '../labels.jsx';
import SearchBox from './SearchBox';
import InventoryModal from './InventoryModal';
import { inr, formatTime } from '../utils';

const VendorLaptopsTab = ({ stores, vendors, brands = [], isAdmin, onNotify, onRefresh }) => {
  const [laptops, setLaptops] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [productLine, setProductLine] = useState('');
  const [showModal, setShowModal] = useState(false);
  const { t } = useLabels();

  const productLines = [...new Set(laptops.map((l) => l.product_line).filter(Boolean))].sort();

  const handleInvSave = async (payload) => {
    try {
      await createLaptop(payload);
      setShowModal(false);
      onNotify?.('Laptop added to inventory from vendor', 'success');
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

  const handleAddLaptop = async (laptopData) => {
    try {
      const res = await createLaptop(laptopData);
      onNotify?.('Laptop added to inventory from vendor', 'success');
      await onRefresh();
      setSearch('');
      setSelectedVendor(null);
      setMinPrice('');
      setMaxPrice('');
      refreshLaptops();
    } catch (err) {
      onNotify?.(err.message, 'error');
    }
  };

  const handleVendorChange = (vendorId) => {
    setSelectedVendor(vendorId);
    setSearch('');
    setMinPrice('');
    setMaxPrice('');
    refreshLaptops();
  };

  const handlePriceChange = () => {
    refreshLaptops();
  };

  return (
    <div className="space-y-6">
      <section className="panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="font-display text-base font-semibold tracking-tight text-ink">
              {t?.tableVendorLaptops || 'Vendor Laptops'}
            </h2>
            <p className="text-xs text-ink-faint">
              Laptops purchased from vendors - track by serial number, config, and price
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                onClick={() => setShowModal(true)}
                className="btn-accent text-sm"
                title="Add a laptop from a vendor"
              >
                + Add Laptop
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => {
                  setSelectedVendor(null);
                  setMinPrice('');
                  setMaxPrice('');
                  setFromDate('');
                  setToDate('');
                  setProductLine('');
                  setSearch('');
                }}
                className="btn-ghost text-sm"
                title="Clear all filters"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-md">
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Search by brand, model, serial number, RAM, storage, processor, generation..."
          countLabel={`${filtered.length} laptops`}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <h3 className="font-semibold text-sm uppercase tracking-wider text-ink-faint">Filter by Vendor</h3>
          <select
            onChange={(e) => handleVendorChange(e.target.value === '' ? null : Number(e.target.value))}
            className="field w-full mt-1.5"
          >
            <option value="">All Vendors</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <h3 className="font-semibold text-sm uppercase tracking-wider text-ink-faint">Filter by Price Range</h3>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              placeholder="Min ₹"
              className="field rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm"
            />
            <input
              type="number"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              placeholder="Max ₹"
              className="field rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm"
            />
          </div>
        </div>
        <div>
          <h3 className="font-semibold text-sm uppercase tracking-wider text-ink-faint">Configuration Filter</h3>
          <select
            onChange={(e) => {
              const value = e.target.value.toLowerCase();
              setSearch(value);
            }}
            className="field w-full mt-1.5"
          >
            <option value="">All Configurations</option>
            <option value="ram">RAM</option>
            <option value="storage">Storage</option>
            <option value="processor">Processor</option>
            <option value="generation">Generation</option>
          </select>
        </div>
        <div>
          <h3 className="font-semibold text-sm uppercase tracking-wider text-ink-faint">Product Line</h3>
          <select
            value={productLine}
            onChange={(e) => setProductLine(e.target.value)}
            className="field w-full mt-1.5"
          >
            <option value="">All Product Lines</option>
            {productLines.map((pl) => (
              <option key={pl} value={pl}>{pl}</option>
            ))}
          </select>
        </div>
        <div>
          <h3 className="font-semibold text-sm uppercase tracking-wider text-ink-faint">Date From</h3>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="field w-full mt-1.5"
          />
        </div>
        <div>
          <h3 className="font-semibold text-sm uppercase tracking-wider text-ink-faint">Date To</h3>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="field w-full mt-1.5"
          />
        </div>
      </div>

      <div className="panel p-5">
        <div className="flex flex-col sm:flex-row gap-3">
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Search laptops... (brand/model/serial/config)"
            countLabel={`${filtered.length} laptops`}
          />
          {selectedVendor && (
            <span className="text-xs text-ink-faint">Vendor: {selectedVendor ? vendors.find(v => v.id === selectedVendor)?.name : '—'}</span>
          )}
          {minPrice || maxPrice && (
            <span className="text-xs text-ink-faint">
              {minPrice ? `Min ₹${minPrice}` : ''} {maxPrice ? `Max ₹${maxPrice}` : ''}
            </span>
          )}
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                  {t?.tableBrand || 'Brand'}
                </th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                  {t?.tableModel || 'Model'}
                </th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                  {t?.tableSerial || 'Serial Number'}
                </th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                  {t?.tableConfig || 'Configuration'}
                </th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                  {t?.tablePurchaseRate || 'Purchase Rate'}
                </th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                  {t?.tablePurchasedFrom || 'Purchased From'}
                </th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                  Added in Vendor
                </th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                  Added to Inventory
                </th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                  {t?.tableStatus || 'Status'}
                </th>
                <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--hairline)]">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-sm text-ink-faint">
                    {t?.noLaptops || 'No laptops found'}
                  </td>
                </tr>
              )}
              {filtered.map((l) => {
                const config = [
                  l.ram || '',
                  l.storage_type || '',
                  l.processor_type || '',
                  l.generation || ''
                ].filter(Boolean).join(' · ');
                return (
                  <tr key={l.id} className="group transition-colors duration-150 hover:bg-surface-2/60">
                    <td className="px-4 py-3 align-middle">
                      <p className="font-medium text-ink">{l.brand || '—'}</p>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <p>{l.brand_model || '—'}</p>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <span className="mono-chip">{l.serial_number}</span>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <p className="text-[10px] text-ink-dim">{config || '—'}</p>
                    </td>
                    <td className="px-4 py-3 align-middle font-mono text-xs text-ink-dim">
                      {l.purchase_rate != null ? inr(l.purchase_rate) : '—'}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <span className="text-ink-dim">{l.purchased_from || '—'}</span>
                    </td>
                    <td className="px-4 py-3 align-middle font-mono text-[11px] text-ink-faint">
                      {l.created_at ? formatTime(l.created_at) : '—'}
                    </td>
                    <td className="px-4 py-3 align-middle font-mono text-[11px] text-ink-faint">
                      {l.status === 'In Stock' && l.created_at ? formatTime(l.created_at) : '—'}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <span className={l.status === 'Sold' ? 'text-stock-risk' : 'status-chip'}>{l.status || '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {isAdmin && (
                          <button
                            onClick={() => handleAddLaptop(l)}
                            className="btn-ghost text-accent"
                            title="Add this laptop to inventory from this vendor's track"
                          >
                            Add to Inventory
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-line bg-surface-2/40">
                <td className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-ink-faint" colSpan={4}>
                  Total Purchase Rate
                </td>
                <td className="px-4 py-2.5 font-mono text-xs font-semibold text-ink">
                  {inr(
                    filtered.reduce((sum, l) => sum + (Number(l.purchase_rate) || 0), 0)
                  )}
                </td>
                <td className="px-4 py-2.5" colSpan={5}></td>
              </tr>
            </tfoot>
          </table>
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
    </div>
  );
};

export default VendorLaptopsTab;