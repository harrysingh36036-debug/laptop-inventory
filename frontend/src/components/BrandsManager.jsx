import { useEffect, useState } from 'react';
import { getBrands, addBrand, updateBrand, deleteBrand } from '../api';

const EMPTY = { name: '', serial_prefix: '' };

export default function BrandsManager({ onNotify }) {
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setBrands(await getBrands());
    } catch (e) {
      onNotify?.(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const startEdit = (b) => {
    setEditingId(b.id);
    setForm({ name: b.name, serial_prefix: b.serial_prefix || '' });
  };

  const submit = async (e) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return onNotify?.('Brand name is required', 'error');
    setBusy(true);
    try {
      if (editingId) {
        await updateBrand(editingId, { ...form, name });
        onNotify?.('Brand updated', 'success');
      } else {
        await addBrand({ ...form, name });
        onNotify?.('Brand added', 'success');
      }
      setForm(EMPTY);
      setEditingId(null);
      await load();
    } catch (err) {
      onNotify?.(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (b) => {
    if (!window.confirm(`Delete brand "${b.name}"? Existing laptops keep their brand name, but new units won't use it.`)) return;
    try {
      await deleteBrand(b.id);
      onNotify?.('Brand deleted', 'success');
      await load();
    } catch (err) {
      onNotify?.(err.message, 'error');
    }
  };

  if (loading) return <p className="text-sm text-slate-400">Loading brands…</p>;

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-slate-700">
          {editingId ? `Edit brand: ${form.name}` : 'Add a new brand'}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-slate-500">Brand Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Lenovo"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500">Serial Prefix</label>
            <input
              value={form.serial_prefix}
              onChange={(e) => setForm({ ...form, serial_prefix: e.target.value })}
              placeholder="e.g. LN010"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-slate-400">Used when bulk-adding units with auto serials.</p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          {editingId && (
            <button
              type="button"
              onClick={() => { setEditingId(null); setForm(EMPTY); }}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {busy ? 'Saving…' : editingId ? 'Save Changes' : 'Add Brand'}
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Brand</th>
              <th className="px-4 py-2.5 font-semibold">Serial Prefix</th>
              <th className="px-4 py-2.5 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {brands.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-400">No brands yet.</td></tr>
            )}
            {brands.map((b) => (
              <tr key={b.id} className="hover:bg-slate-50/60">
                <td className="px-4 py-2.5 font-medium text-slate-800">{b.name}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{b.serial_prefix || '—'}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => startEdit(b)}
                      className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => remove(b)}
                      className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}