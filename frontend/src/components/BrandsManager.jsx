import { useEffect, useState } from 'react';
import { getBrands, addBrand, updateBrand, deleteBrand } from '../api';
import DangerConfirmModal from './DangerConfirmModal';

const EMPTY = { name: '', serial_prefix: '' };

export default function BrandsManager({ onNotify }) {
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [danger, setDanger] = useState(null); // brand scheduled for deletion

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

  const confirmDelete = async (pwd, remarks) => {
    if (!danger) return '';
    try {
      await deleteBrand(danger.id, pwd, remarks);
      onNotify?.('Brand deleted', 'success');
      setDanger(null);
      await load();
      return '';
    } catch (err) {
      return err.message;
    }
  };

  if (loading) return <p className="text-sm text-ink-faint">Loading brands…</p>;

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="rounded-xl border border-line bg-surface-2/40 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-ink">
          {editingId ? `Edit brand: ${form.name}` : 'Add a new brand'}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="flabel">Brand Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Lenovo"
              className="field mt-1.5"
            />
          </div>
          <div>
            <label className="flabel">Serial Prefix</label>
            <input
              value={form.serial_prefix}
              onChange={(e) => setForm({ ...form, serial_prefix: e.target.value })}
              placeholder="e.g. LN010"
              className="field mt-1.5 font-mono"
            />
            <p className="mt-1 text-[11px] text-ink-faint">Used when bulk-adding units with auto serials.</p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          {editingId && (
            <button
              type="button"
              onClick={() => { setEditingId(null); setForm(EMPTY); }}
              className="btn-ghost"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={busy}
            className="btn-accent disabled:opacity-50"
          >
            {busy ? 'Saving…' : editingId ? 'Save Changes' : 'Add Brand'}
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-xl border border-line">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2/50 text-[10px] uppercase tracking-wider text-ink-faint">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Brand</th>
              <th className="px-4 py-2.5 font-semibold">Serial Prefix</th>
              <th className="px-4 py-2.5 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--hairline)]">
            {brands.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-ink-faint">No brands yet.</td></tr>
            )}
            {brands.map((b) => (
              <tr key={b.id} className="transition-colors duration-150 hover:bg-surface-2/60">
                <td className="px-4 py-2.5 font-medium text-ink">{b.name}</td>
                <td className="px-4 py-2.5">
                  <span className="mono-chip">{b.serial_prefix || '—'}</span>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => startEdit(b)} className="btn-ghost">Edit</button>
                    <button onClick={() => setDanger(b)} className="btn-danger">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {danger && (
        <DangerConfirmModal
          title="Delete this brand?"
          warning={`"${danger.name}" will be removed. Existing laptops keep their brand name, but new units won't use it.`}
          onConfirm={confirmDelete}
          onClose={() => setDanger(null)}
        />
      )}
    </div>
  );
}