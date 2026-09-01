import { useEffect, useState } from 'react';
import { getVendors, addVendor, updateVendor, deleteVendor, bulkDeleteVendors } from '../api';
import { createLaptop } from '../api';
import { getLaptops } from '../api';
import { getIstToday } from '../utils';
import DangerConfirmModal from './DangerConfirmModal';
import ReturnToVendorModal from './ReturnToVendorModal';

const EMPTY = { name: '', contact: '', address: '', brand: '', model: '', serial_number: '', purchase_rate: '', storage: '', ram: '', processor: '', generation: '' };

export default function VendorsManager({ onNotify }) {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [danger, setDanger] = useState(null); // { kind:'one', v } | { kind:'bulk', ids, names }
  const [returnTarget, setReturnTarget] = useState(null);
  const [addingLaptop, setAddingLaptop] = useState(false);
  const [addLaptopForm, setAddLaptopForm] = useState({ brand: '', model: '', serial_number: '', purchase_rate: '', storage: '', ram: '', processor: '', generation: '', purchase_date: getIstToday() });
  const [search, setSearch] = useState('');
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');

  const load = async () => {
    try {
      setVendors(await getVendors());
      setSelected(new Set());
    } catch (e) {
      onNotify?.(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  useEffect(() => {
    const timeout = setTimeout(() => {
      load();
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  const startEdit = (v) => {
    setEditingId(v.id);
    setForm({ name: v.name, contact: v.contact || '', address: v.address || '' });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(EMPTY);
  };

  const submit = async (e) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return onNotify?.('Vendor name is required', 'error');
    const contact = form.contact.trim();
    if (contact && !/^\d{10}$/.test(contact)) return onNotify?.('Contact must be a 10-digit phone number', 'error');
    setBusy(true);
    try {
      if (editingId) {
        await updateVendor(editingId, { ...form, name, contact });
        onNotify?.('Vendor updated', 'success');
      } else {
        await addVendor({ ...form, name, contact });
        onNotify?.('Vendor added', 'success');
      }
      cancelEdit();
      await load();
    } catch (err) {
      onNotify?.(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async (pwd, remarks) => {
    if (!danger) return '';
    setBusy(true);
    try {
      if (danger.kind === 'one') {
        await deleteVendor(danger.v.id, pwd, remarks);
        onNotify?.('Vendor deleted', 'success');
      } else {
        const res = await bulkDeleteVendors(danger.ids, pwd, remarks);
        onNotify?.(`${res?.deleted ?? danger.ids.length} vendor(s) deleted`, 'success');
      }
      setDanger(null);
      await load();
      return '';
    } catch (err) {
      return err.message;
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => (prev.size === vendors.length ? new Set() : new Set(vendors.map((v) => v.id))));
  };

  const filteredLaptops = () => {
    const searchLower = search.trim().toLowerCase();
    const minPriceNum = minPrice ? Number(minPrice) : null;
    const maxPriceNum = maxPrice ? Number(maxPrice) : null;
    const vendorId = selectedVendor || null;

    return (getLaptops({ search: searchLower }) || [])
      .filter((l) => vendorId ? l.id !== undefined && true : !l.current_store_id || l.current_store_id === null)
      .filter((l) => {
        const brandMatch = (l.brand || '').toLowerCase().includes(searchLower);
        const modelMatch = (l.brand_model || '').toLowerCase().includes(searchLower);
        const serialMatch = (l.serial_number || '').toLowerCase().includes(searchLower);
        const configMatch = [
          (l.ram || '').toLowerCase().includes(searchLower),
          (l.storage_type || '').toLowerCase().includes(searchLower),
          (l.processor_type || '').toLowerCase().includes(searchLower),
          (l.generation || '').toLowerCase().includes(searchLower)
        ].some(Boolean);
        const priceMatch = (l.purchase_rate != null && l.purchase_rate >= minPriceNum && l.purchase_rate <= maxPriceNum) || (!minPriceNum && !maxPriceNum);
        return (brandMatch || modelMatch || serialMatch || configMatch) && priceMatch;
      });
  };

  const selectLaptopForVendor = (laptop) => {
    setAddLaptopForm((prev) => ({
      brand: laptop.brand,
      model: laptop.brand_model,
      serial_number: laptop.serial_number,
      purchase_rate: laptop.purchase_rate != null ? String(laptop.purchase_rate) : '',
      storage: laptop.storage || '',
      ram: laptop.ram || '',
      processor: laptop.processor_type || '',
      generation: laptop.generation || '',
      purchase_date: prev.purchase_date || getIstToday()
    }));
    setSelectedVendor(laptop.id);
    setMinPrice('');
    setMaxPrice('');
  };

  const bulkRemove = async () => {
    if (selected.size === 0) return;
    const names = vendors.filter((v) => selected.has(v.id)).map((v) => v.name);
    setDanger({ kind: 'bulk', ids: [...selected], names });
  };

  const addLaptopFromVendor = async () => {
    if (!addLaptopForm.purchase_date) {
      onNotify?.('Purchase date is required', 'error');
      return;
    }
    setAddingLaptop(true);
    const laptopData = {
      brand: addLaptopForm.brand,
      brand_model: addLaptopForm.model,
      serial_number: addLaptopForm.serial_number,
      purchase_rate: addLaptopForm.purchase_rate != null ? Number(addLaptopForm.purchase_rate) : null,
      purchased_from: vendors.find((v) => v.id === editingId)?.name || '',
      status: 'In Stock',
      current_store_id: null,
      created_at: addLaptopForm.purchase_date,
      purchase_date: addLaptopForm.purchase_date
    };
    try {
      const res = await createLaptop(laptopData);
      onNotify?.('Laptop added to inventory from vendor', 'success');
      await load();
      setAddingLaptop(false);
      setAddLaptopForm({ brand: '', model: '', serial_number: '', purchase_rate: '', storage: '', ram: '', processor: '', generation: '', purchase_date: getIstToday() });
      setSelectedVendor(null);
      setMinPrice('');
      setMaxPrice('');
      return res;
    } catch (err) {
      onNotify?.(err.message, 'error');
      setAddingLaptop(false);
    }
  };

  if (loading) return <p className="text-sm text-ink-faint">Loading vendors…</p>;

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="rounded-xl border border-line bg-surface-2/40 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-ink">
          {editingId ? `Edit vendor: ${form.name}` : 'Add a new vendor'}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="flabel">Vendor Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. HP Direct"
              className="field mt-1.5"
            />
          </div>
          <div>
            <label className="flabel">Contact (Phone)</label>
            <input
              type="tel"
              inputMode="numeric"
              value={form.contact}
              maxLength={10}
              onChange={(e) => setForm({ ...form, contact: e.target.value.replace(/\D/g, '').slice(0, 10) })}
              placeholder="e.g. 9876543210"
              className="field mt-1.5"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search vendors..."
            className="field w-40 rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm"
          />
          <select
            value={selectedVendor !== null ? String(selectedVendor) : ''}
            onChange={(e) => {
              const id = e.target.value ? Number(e.target.value) : null;
              if (id) {
                setSelectedVendor(id);
                setSearch('');
                setMinPrice('');
                setMaxPrice('');
              } else {
                setSelectedVendor(null);
              }
            }}
            className="field w-24 rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm"
          >
            <option value="">All</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            placeholder="Min ₹"
            className="field w-32 rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm"
          />
          <input
            type="number"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            placeholder="Max ₹"
            className="field w-32 rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="flabel">Address</label>
          <input
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            placeholder="e.g. 123 Main St, Delhi"
            className="field mt-1.5"
          />
        </div>
        <div className="flex justify-end gap-2">
          {editingId && (
            <button type="button" onClick={cancelEdit} className="btn-ghost">
              Cancel
            </button>
          )}
          <button type="submit" disabled={busy} className="btn-accent disabled:opacity-50">
            {busy ? 'Saving…' : editingId ? 'Save Changes' : 'Add Vendor'}
          </button>
        </div>
      </form>

      {selected.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-stock-risk/25 bg-stock-risk/10 px-4 py-2.5">
          <p className="text-sm text-stock-risk">{selected.size} selected</p>
          <button onClick={bulkRemove} disabled={busy} className="btn-danger disabled:opacity-50">
            {busy ? 'Deleting…' : 'Delete Selected'}
          </button>
        </div>
      )}

      {editingId && !addingLaptop && (
        <div className="mt-4 p-4 bg-surface-2/50 rounded-lg border border-accent-line max-h-[85vh] md:max-h-none flex flex-col">
          <h4 className="font-semibold text-ink mb-3">Add Laptop(s) from Vendor</h4>
          <p className="text-xs text-ink-faint mb-3">
            Add new laptop(s) associated with this vendor. These will be tracked in inventory with the vendor name.
          </p>
          <div className="overflow-y-auto flex-1 -mx-1 px-1 pb-2 space-y-3">
            <p className="text-xs text-ink-faint">
              Search laptops to add or enter details manually:
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="flabel">Brand</label>
                <input value={addLaptopForm.brand} onChange={(e) => setAddLaptopForm({ ...addLaptopForm, brand: e.target.value })} placeholder="e.g. HP" className="field mt-1.5" />
              </div>
              <div>
                <label className="flabel">Model</label>
                <input value={addLaptopForm.model} onChange={(e) => setAddLaptopForm({ ...addLaptopForm, model: e.target.value })} placeholder="e.g. Pavilion 15" className="field mt-1.5" />
              </div>
              <div>
                <label className="flabel">Serial Number</label>
                <input value={addLaptopForm.serial_number} onChange={(e) => setAddLaptopForm({ ...addLaptopForm, serial_number: e.target.value })} placeholder="e.g. 5CG1234ABC" className="field mt-1.5" />
              </div>
              <div>
                <label className="flabel">Purchase Rate (₹)</label>
                <input type="number" min="0" value={addLaptopForm.purchase_rate} onChange={(e) => setAddLaptopForm({ ...addLaptopForm, purchase_rate: e.target.value })} className="field mt-1.5" />
              </div>
              <div>
                <label className="flabel">Storage</label>
                <input value={addLaptopForm.storage} onChange={(e) => setAddLaptopForm({ ...addLaptopForm, storage: e.target.value })} placeholder="e.g. 512 GB SSD" className="field mt-1.5" />
              </div>
              <div>
                <label className="flabel">RAM</label>
                <input value={addLaptopForm.ram} onChange={(e) => setAddLaptopForm({ ...addLaptopForm, ram: e.target.value })} placeholder="e.g. 16 GB" className="field mt-1.5" />
              </div>
              <div>
                <label className="flabel">Processor</label>
                <input value={addLaptopForm.processor} onChange={(e) => setAddLaptopForm({ ...addLaptopForm, processor: e.target.value })} placeholder="e.g. Core i5" className="field mt-1.5" />
              </div>
              <div>
                <label className="flabel">Generation</label>
                <input value={addLaptopForm.generation} onChange={(e) => setAddLaptopForm({ ...addLaptopForm, generation: e.target.value })} placeholder="e.g. 11th Gen" className="field mt-1.5" />
              </div>
              <div>
                <label className="flabel">Purchase Date *</label>
                <input type="date" value={addLaptopForm.purchase_date} onChange={(e) => setAddLaptopForm({ ...addLaptopForm, purchase_date: e.target.value })} required className="field mt-1.5" />
              </div>
            </div>
            <div>
              <label className="flabel">Search Laptops</label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by brand/model/serial/configuration..."
                className="field mt-1.5 w-full"
              />
            </div>
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
            <div className="h-60 md:h-96 overflow-y-auto bg-surface-2/50 rounded-lg border border-line p-3">
              <p className="text-xs text-ink-faint mb-2">Matching laptops:</p>
              {filteredLaptops().length === 0 && <p className="text-xs text-ink-faint">No matching laptops</p>}
              {filteredLaptops().map((l) => (
                <div
                  key={l.id}
                  onClick={() => selectLaptopForVendor(l)}
                  className="p-2 rounded-md border border-line cursor-pointer hover:bg-surface-2/60 mb-1"
                  title={`Serial: ${l.serial_number} - ${l.brand_model}`}
                >
                  <div className="font-medium text-ink">{l.brand_model || l.brand}</div>
                  <div className="text-[10px] text-ink-dim">Serial: {l.serial_number} · Config: {l.ram || '—'}·{l.storage_type || '—'} · Rate: {l.purchase_rate != null ? `₹${l.purchase_rate}` : '—'} · Vendor: {l.purchased_from || 'Unassigned'}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-line shrink-0">
            <button type="button" onClick={() => setAddLaptopForm({ brand: '', model: '', serial_number: '', purchase_rate: '', storage: '', ram: '', processor: '', generation: '', purchase_date: getIstToday() })} className="btn-ghost">Cancel</button>
            <button type="submit" disabled={busy} className="btn-accent disabled:opacity-50">
              {busy ? 'Adding…' : 'Add to Inventory'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (selectedVendor) {
                  const laptop = filteredLaptops().find((l) => l.id === selectedVendor);
                  if (laptop) setReturnTarget(laptop);
                }
              }}
              disabled={!selectedVendor || busy}
              className="btn-ghost text-stock-risk disabled:opacity-50"
            >
              Return
            </button>
          </div>
        </div>
      )}

      {/* Desktop table */}
      <div className="hidden md:block overflow-hidden rounded-xl border border-line">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2/50 text-[10px] uppercase tracking-wider text-ink-faint">
            <tr>
              <th className="px-4 py-2.5 font-semibold w-10">
                <input
                  type="checkbox"
                  checked={vendors.length > 0 && selected.size === vendors.length}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded accent-accent"
                  aria-label="Select all vendors"
                />
              </th>
              <th className="px-4 py-2.5 font-semibold">Vendor</th>
              <th className="px-4 py-2.5 font-semibold">Contact</th>
              <th className="px-4 py-2.5 font-semibold">Address</th>
              <th className="px-4 py-2.5 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--hairline)]">
            {vendors.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-ink-faint">No vendors yet.</td></tr>
            )}
            {vendors.map((v) => (
              <tr key={v.id} className="transition-colors duration-150 hover:bg-surface-2/60">
                <td className="px-4 py-2.5">
                  <input
                    type="checkbox"
                    checked={selected.has(v.id)}
                    onChange={() => toggle(v.id)}
                    className="h-4 w-4 rounded accent-accent"
                    aria-label={`Select ${v.name}`}
                  />
                </td>
                <td className="px-4 py-2.5 font-medium text-ink">{v.name}</td>
                <td className="px-4 py-2.5 text-ink-dim">{v.contact || '—'}</td>
                <td className="px-4 py-2.5 text-ink-dim">{v.address || '—'}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => startEdit(v)} className="btn-ghost">Edit</button>
                    <button onClick={() => setDanger({ kind: 'one', v })} className="btn-danger">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards – horizontal swipe */}
      <div className="md:hidden">
        {vendors.length === 0 ? (
          <p className="text-center text-sm text-ink-faint py-6">No vendors yet.</p>
        ) : (
          <div className="-mx-4 px-4 overflow-x-auto snap-x snap-mandatory flex gap-3 pb-2 scrollbar-none">
            {vendors.map((v) => (
              <div key={v.id} className="min-w-[260px] max-w-[80vw] snap-start shrink-0 rounded-xl border border-line bg-surface-2/40 p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink truncate">{v.name}</p>
                    {v.contact && <p className="text-xs text-ink-dim mt-0.5 truncate">{v.contact}</p>}
                    {v.address && <p className="text-xs text-ink-faint mt-0.5 truncate">{v.address}</p>}
                  </div>
                  <input
                    type="checkbox"
                    checked={selected.has(v.id)}
                    onChange={() => toggle(v.id)}
                    className="h-4 w-4 rounded accent-accent shrink-0 mt-0.5"
                    aria-label={`Select ${v.name}`}
                  />
                </div>
                <div className="flex items-center gap-2 pt-1 border-t border-line">
                  <button onClick={() => startEdit(v)} className="btn-ghost text-xs">Edit</button>
                  <button onClick={() => setDanger({ kind: 'one', v })} className="btn-danger text-xs">Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
        {vendors.length > 1 && (
          <p className="text-center text-[10px] text-ink-faint mt-1">Swipe to browse vendors</p>
        )}
      </div>

      {danger && (
        <DangerConfirmModal
          title={danger.kind === 'one' ? 'Delete this vendor?' : `Delete ${danger.ids.length} vendors?`}
          warning={
            danger.kind === 'one'
              ? `"${danger.v.name}" will be removed. Existing laptops keep the name already entered.`
              : `These vendors will be removed: ${danger.names.join(', ')}`
          }
          onConfirm={confirmDelete}
          onClose={() => setDanger(null)}
        />
      )}

      {returnTarget && (
        <ReturnToVendorModal
          laptop={returnTarget}
          onNotify={onNotify}
          onClose={() => { setReturnTarget(null); load(); }}
        />
      )}
    </div>
  );
}

const addLaptopFromVendorForm = async (e, vendorId) => {
    e.preventDefault();
    setForm(EMPTY);
  };
