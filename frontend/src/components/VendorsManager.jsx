import { useEffect, useState } from 'react';
import { getVendors, addVendor, updateVendor, deleteVendor, bulkDeleteVendors } from '../api';
import DangerConfirmModal from './DangerConfirmModal';

const EMPTY = { name: '', contact: '' };

export default function VendorsManager({ onNotify }) {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [danger, setDanger] = useState(null); // { kind:'one', v } | { kind:'bulk', ids, names }

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

  const startEdit = (v) => {
    setEditingId(v.id);
    setForm({ name: v.name, contact: v.contact || '' });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(EMPTY);
  };

  const submit = async (e) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return onNotify?.('Vendor name is required', 'error');
    setBusy(true);
    try {
      if (editingId) {
        await updateVendor(editingId, { ...form, name });
        onNotify?.('Vendor updated', 'success');
      } else {
        await addVendor({ ...form, name });
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

  const bulkRemove = async () => {
    if (selected.size === 0) return;
    const names = vendors.filter((v) => selected.has(v.id)).map((v) => v.name);
    setDanger({ kind: 'bulk', ids: [...selected], names });
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
            <label className="flabel">Contact</label>
            <input
              value={form.contact}
              onChange={(e) => setForm({ ...form, contact: e.target.value })}
              placeholder="e.g. Rajesh · 98xxxxxx"
              className="field mt-1.5"
            />
          </div>
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

      <div className="overflow-hidden rounded-xl border border-line">
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
              <th className="px-4 py-2.5 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--hairline)]">
            {vendors.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-ink-faint">No vendors yet.</td></tr>
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
    </div>
  );
}
