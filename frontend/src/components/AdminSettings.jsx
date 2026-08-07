import { useState } from 'react';
import { DEFAULT_LABELS } from '../labels.jsx';
import { getPermissions, savePermissions } from '../api';

// Description rows for the customizable button/label texts.
const LABEL_FIELDS = [
  ['appTitle', 'Dashboard title'],
  ['appSubtitle', 'Dashboard subtitle'],
  ['filterByStore', 'Store filter heading'],
  ['allStores', 'All-stores button'],
  ['statusLabel', 'Status filter heading'],
  ['anyStatus', 'Status dropdown "any" option'],
  ['searchPlaceholder', 'Search box placeholder'],
  ['addInventoryButton', 'Add-inventory button'],
  ['tableBrand', 'Column: brand/model'],
  ['tableSerial', 'Column: serial number'],
  ['tableStore', 'Column: store'],
  ['tableStatus', 'Column: status'],
  ['tableUpdated', 'Column: updated'],
  ['tableChangeLocation', 'Column: change location'],
  ['tableActions', 'Column: actions'],
  ['selectStore', 'Transfer dropdown placeholder'],
  ['unassigned', '"Unassigned" cell text'],
  ['viewOnly', 'View-only cell text'],
  ['editButton', 'Edit button'],
  ['deleteButton', 'Delete button'],
  ['transferButton', 'Confirm Transfer button'],
  ['transferHistory', 'History section title'],
  ['transferHistorySubtitle', 'History section subtitle'],
  ['addLaptopTitle', 'Add-modal title'],
  ['editLaptopTitle', 'Edit-modal title'],
  ['noLaptops', 'Empty-table message']
];

// Admin-configurable capabilities per role (admin always has everything).
const PERMISSION_FIELDS = [
  ['editInventory', 'Add / edit / remove laptops'],
  ['transferLaptops', 'Transfer laptops between stores'],
  ['createStaff', 'Create staff accounts'],
  ['renameStores', 'Rename stores'],
  ['editLabels', 'Edit buttons & labels']
];

const DEFAULT_PERMISSIONS = {
  manager: {
    editInventory: true,
    transferLaptops: true,
    createStaff: true,
    renameStores: true,
    editLabels: false
  },
  staff: {
    editInventory: false,
    transferLaptops: false,
    createStaff: false,
    renameStores: false,
    editLabels: false
  }
};

export default function AdminSettings({ stores, settings, onSaveSettings, onSaveStore, onDeleteStore, onClose, isAdmin = true }) {
  const [labels, setLabels] = useState({ ...DEFAULT_LABELS, ...(settings || {}) });
  const [storeName, setStoreName] = useState('');
  const [edits, setEdits] = useState({}); // storeId -> draft name
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const [tab, setTab] = useState(isAdmin ? 'stores' : 'stores');

  const setLabel = (key) => (e) => setLabels((l) => ({ ...l, [key]: e.target.value }));
  const setEdit = (id) => (e) => setEdits((d) => ({ ...d, [id]: e.target.value }));

  const flash = (msg) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 2500);
  };

  const saveLabels = async () => {
    setSaving(true);
    const err = await onSaveSettings(labels);
    setSaving(false);
    if (err) flash(err);
    else flash('Labels saved');
  };

  const addStore = async (e) => {
    e.preventDefault();
    if (!storeName.trim()) return;
    const err = await onSaveStore({ store_name: storeName.trim() });
    if (err) return flash(err);
    setStoreName('');
    flash('Store added');
  };

  const renameOne = async (id, value) => {
    if (!value?.trim()) return;
    const err = await onSaveStore({ id, store_name: value.trim() });
    if (err) return flash(err);
    setEdits((d) => { const n = { ...d }; delete n[id]; return n; });
    flash('Store renamed');
  };

  const removeOne = async (id, name) => {
    if (!window.confirm(`Remove "${name}"?`)) return;
    const err = await onDeleteStore(id);
    if (err) return flash(err);
    flash('Store removed');
  };

  // ---- Permissions tab (admin only) --------------------------------------
  const [perms, setPerms] = useState(null);
  const [permsLoaded, setPermsLoaded] = useState(false);
  const [permsSaving, setPermsSaving] = useState(false);

  const loadPerms = async () => {
    try {
      const p = await getPermissions();
      setPerms({
        manager: { ...DEFAULT_PERMISSIONS.manager, ...(p.manager || {}) },
        staff: { ...DEFAULT_PERMISSIONS.staff, ...(p.staff || {}) }
      });
    } catch (e) {
      flash(e.message);
    } finally {
      setPermsLoaded(true);
    }
  };

  const togglePerm = (role, key) =>
    setPerms((p) => ({ ...p, [role]: { ...p[role], [key]: !p[role][key] } }));

  const savePerms = async () => {
    if (!perms) return;
    setPermsSaving(true);
    try {
      await savePermissions(perms);
      flash('Permissions saved');
    } catch (e) {
      flash(e.message);
    } finally {
      setPermsSaving(false);
    }
  };

  const selectTab = (k) => {
    setTab(k);
    if (k === 'permissions' && !permsLoaded) loadPerms();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">{isAdmin ? 'Admin Settings' : 'Store Management'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {message && <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>}

        {/* Tabs */}
        <div className="mt-4 flex gap-1 rounded-xl bg-slate-100 p-1">
          {[
            ['stores', 'Stores'],
            ...(isAdmin
              ? [
                  ['labels', 'Buttons & Labels'],
                  ['permissions', 'Roles & Permissions']
                ]
              : [])
          ].map(([k, n]) => (
            <button
              key={k}
              onClick={() => selectTab(k)}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
                tab === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {n}
            </button>
          ))}
        </div>

        {message && <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>}

        {/* Tabs */}
        <div className="mt-4 flex gap-1 rounded-xl bg-slate-100 p-1">
          {[
            ['stores', 'Stores'],
            ['labels', 'Buttons & Labels']
          ].map(([k, n]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
                tab === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {n}
            </button>
          ))}
        </div>

        {tab === 'stores' && (
          <div className="mt-4 space-y-4">
            {/* Add store (admin only) */}
            {isAdmin && (
              <form onSubmit={addStore} className="flex gap-2">
                <input
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="New store name…"
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
                >
                  Add Store
                </button>
              </form>
            )}

            {/* Rename list */}
            <div className="space-y-2">
              {stores.map((s) => {
                const draft = edits[s.id] ?? s.store_name;
                return (
                  <div key={s.id} className="flex items-center gap-2">
                    <input
                      value={draft}
                      onChange={setEdit(s.id)}
                      className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                    />
                    <button
                      onClick={() => renameOne(s.id, draft)}
                      disabled={draft.trim() === s.store_name}
                      className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-40"
                    >
                      Rename
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => removeOne(s.id, s.store_name)}
                        className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {!isAdmin && (
              <p className="text-xs text-slate-400">
                Managers can rename stores. Adding or removing stores is restricted to admins.
              </p>
            )}
          </div>
        )}

        {tab === 'labels' && (
          <div className="mt-4 space-y-3">
            {LABEL_FIELDS.map(([key, hint]) => (
              <div key={key}>
                <label className="text-xs font-medium text-slate-500">{hint}</label>
                <input
                  value={labels[key]}
                  onChange={setLabel(key)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                />
              </div>
            ))}
            <div className="flex justify-end pt-2">
              <button
                onClick={saveLabels}
                disabled={saving}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save Labels'}
              </button>
            </div>
          </div>
        )}

        {tab === 'permissions' && (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-slate-500">
              Control what managers and staff can do. Admin always has full access to everything.
            </p>
            {!perms ? (
              <p className="text-sm text-slate-400">Loading permissions…</p>
            ) : (
              <>
                {['manager', 'staff'].map((role) => (
                  <div key={role} className="rounded-xl border border-slate-200 p-4">
                    <h3 className="text-sm font-semibold capitalize text-slate-800">{role}</h3>
                    <div className="mt-2 space-y-2">
                      {PERMISSION_FIELDS.map(([key, hint]) => (
                        <label
                          key={key}
                          className="flex cursor-pointer items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                        >
                          <span>{hint}</span>
                          <input
                            type="checkbox"
                            checked={!!perms[role][key]}
                            onChange={() => togglePerm(role, key)}
                            className="h-4 w-4 rounded accent-slate-900"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="flex justify-end pt-1">
                  <button
                    onClick={savePerms}
                    disabled={permsSaving}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
                  >
                    {permsSaving ? 'Saving…' : 'Save Permissions'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}