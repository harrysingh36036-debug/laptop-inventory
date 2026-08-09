import { useEffect, useState, Fragment } from 'react';
import { inr } from '../utils';
import { getCustomers, getSales, addCustomer, updateCustomer, deleteCustomer, bulkDeleteCustomers } from '../api';

const EMPTY = { name: '', phone: '', email: '', address: '', notes: '' };

const input = 'field mt-1.5';
const th = 'px-4 py-2.5 font-semibold';
const td = 'px-4 py-2.5';

export default function CustomersManager({ onNotify }) {
  const [customers, setCustomers] = useState([]);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [openCustomer, setOpenCustomer] = useState(null);

  const purchasesFor = (c) => (sales || []).filter((s) => s.customer_id === c.id || s.customer_name === c.name);

  const load = async () => {
    try {
      const [c, s] = await Promise.all([getCustomers(), getSales().catch(() => [])]);
      setCustomers(c);
      setSales(s || []);
      setSelected(new Set());
    } catch (e) {
      onNotify?.(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const startEdit = (c) => {
    setEditingId(c.id);
    setForm({
      name: c.name,
      phone: c.phone || '',
      email: c.email || '',
      address: c.address || '',
      notes: c.notes || ''
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(EMPTY);
  };

  const submit = async (e) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return onNotify?.('Customer name is required', 'error');
    setBusy(true);
    try {
      if (editingId) {
        await updateCustomer(editingId, { ...form, name });
        onNotify?.('Customer updated', 'success');
      } else {
        await addCustomer({ ...form, name });
        onNotify?.('Customer added', 'success');
      }
      cancelEdit();
      await load();
    } catch (err) {
      onNotify?.(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c) => {
    if (!window.confirm(`Delete customer "${c.name}"?`)) return;
    try {
      await deleteCustomer(c.id);
      onNotify?.('Customer deleted', 'success');
      await load();
    } catch (err) {
      onNotify?.(err.message, 'error');
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
    setSelected((prev) =>
      prev.size === customers.length ? new Set() : new Set(customers.map((c) => c.id))
    );
  };

  const bulkRemove = async () => {
    if (selected.size === 0) return;
    const names = customers.filter((c) => selected.has(c.id)).map((c) => c.name);
    if (!window.confirm(`Delete ${selected.size} customer(s)?\n\n${names.join(', ')}`)) return;
    setBusy(true);
    try {
      const res = await bulkDeleteCustomers([...selected]);
      onNotify?.(`${res?.deleted ?? selected.size} customer(s) deleted`, 'success');
      await load();
    } catch (err) {
      onNotify?.(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="text-sm text-ink-faint">Loading customers…</p>;

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="rounded-xl border border-line bg-surface-2/40 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-ink">
          {editingId ? `Edit customer: ${form.name}` : 'Add a new customer'}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="flabel">Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Aman Sharma"
              className={input}
            />
          </div>
          <div>
            <label className="flabel">Phone</label>
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="e.g. 98xxxxxxxx"
              className={input}
            />
          </div>
          <div>
            <label className="flabel">Email</label>
            <input
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="e.g. aman@example.com"
              className={input}
            />
          </div>
          <div>
            <label className="flabel">Address</label>
            <input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="e.g. 12, MG Road, Delhi"
              className={input}
            />
          </div>
        </div>
        <div>
          <label className="flabel">Notes</label>
          <input
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Optional remarks"
            className={input}
          />
        </div>
        <div className="flex justify-end gap-2">
          {editingId && (
            <button type="button" onClick={cancelEdit} className="btn-ghost">
              Cancel
            </button>
          )}
          <button type="submit" disabled={busy} className="btn-accent disabled:opacity-50">
            {busy ? 'Saving…' : editingId ? 'Save Changes' : 'Add Customer'}
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

      <div className="overflow-hidden rounded-xl border border-line">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-surface-2/50 text-[10px] uppercase tracking-wider text-ink-faint">
              <tr>
                <th className={`${th} w-10`}>
                  <input
                    type="checkbox"
                    checked={customers.length > 0 && selected.size === customers.length}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded accent-[#E0A458]"
                    aria-label="Select all customers"
                  />
                </th>
                <th className={th}>Name</th>
                <th className={th}>Phone</th>
                <th className={th}>Email</th>
                <th className={th}>Address</th>
                <th className={`${th} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--hairline)]">
              {customers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-ink-faint">
                    No customers yet.
                  </td>
                </tr>
              )}
              {customers.map((c) => (
                <Fragment key={c.id}>
                <tr className="transition-colors duration-150 hover:bg-surface-2/60">
                  <td className={td}>
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() => toggle(c.id)}
                      className="h-4 w-4 rounded accent-[#E0A458]"
                      aria-label={`Select ${c.name}`}
                    />
                  </td>
                  <td className={`${td} font-medium text-ink`}>{c.name}</td>
                  <td className={`${td} font-mono text-xs text-ink-dim`}>{c.phone || '—'}</td>
                  <td className={`${td} text-ink-dim`}>{c.email || '—'}</td>
                  <td className={`${td} text-ink-dim`}>{c.address || '—'}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => setOpenCustomer(openCustomer === c.id ? null : c.id)} className="btn-ghost" aria-label={`Show purchases for ${c.name}`}>
                        {purchasesFor(c).length > 0 ? '▼' : '—'}
                      </button>
                      <button onClick={() => startEdit(c)} className="btn-ghost">Edit</button>
                      <button onClick={() => remove(c)} className="btn-danger">Delete</button>
                    </div>
                  </td>
                </tr>
                {openCustomer === c.id && (
                  <tr>
                    <td colSpan={9} className="px-4 py-0 pb-2">
                      {purchasesFor(c).length === 0 ? (
                        <p className="text-xs text-ink-faint">No purchases recorded.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[600px] text-left text-xs">
                            <thead className="text-[10px] uppercase tracking-wider text-ink-faint">
                              <tr>
                                <th className="px-2 py-1.5 text-left">Laptop</th>
                                <th className="px-2 py-1.5 text-left">Serial</th>
                                <th className="px-2 py-1.5 text-left">Store</th>
                                <th className="px-2 py-1.5 text-right">Sale Price</th>
                                <th className="px-2 py-1.5 text-left">Sold At</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--hairline)]">
                              {purchasesFor(c).map((s) => (
                                <tr key={s.id} className="hover:bg-surface-2/50">
                                  <td className="px-2 py-1">{s.brand_model}</td>
                                  <td className="px-2 py-1 mono-chip text-[10px]">{s.serial_number}</td>
                                  <td className="px-2 py-1 text-ink-dim">{s.store_name || '—'}</td>
                                  <td className="px-2 py-1 text-right font-mono">{inr(s.sale_price)}</td>
                                  <td className="px-2 py-1 text-ink-faint">{s.sold_at || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
