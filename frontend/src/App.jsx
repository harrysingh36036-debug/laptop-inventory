import { useEffect, useState, useCallback } from 'react';
import {
  getStores,
  getLaptops,
  getTransferLogs,
  transferLaptop,
  createLaptop,
  updateLaptop,
  deleteLaptop,
  getToken,
  setToken,
  getMe,
  getSettings,
  saveSettings,
  addStore,
  renameStore,
  deleteStore
} from './api';
import { socket, setSocketAuth } from './socket';
import { LabelsProvider } from './labels.jsx';
import Login from './components/Login';
import StoreFilter from './components/StoreFilter';
import Toolbar from './components/Toolbar';
import LaptopTable from './components/LaptopTable';
import HistoryLog from './components/HistoryLog';
import InventoryModal from './components/InventoryModal';
import AccountManager from './components/AccountManager';
import AdminSettings from './components/AdminSettings';
import Toast from './components/Toast';

export default function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  const [stores, setStores] = useState([]);
  const [laptops, setLaptops] = useState([]);
  const [logs, setLogs] = useState([]);
  const [labels, setLabels] = useState({});

  // Filters / state
  const [storeId, setStoreId] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');

  // Toast / sync notifications
  const [toast, setToast] = useState(null);
  const [connected, setConnected] = useState(false);

  // Modals: null = closed
  const [invModal, setInvModal] = useState(null);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const isAdmin = user?.role === 'admin';
  const canEdit = user && (user.role === 'admin' || user.role === 'manager');

  const notify = useCallback((msg, type = 'info') => {
    setToast({ msg, type, id: Date.now() });
  }, []);

  const handleAuth = useCallback((token, nextUser, current = user) => {
    setToken(token);
    setSocketAuth(token);
    if (nextUser.role !== current?.role || nextUser.id !== current?.id) socket.connect();
    setUser(nextUser);
  }, [user]);

  // ---- Auth bootstrap: restore session from a saved token -----------------
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setAuthReady(true);
      return;
    }
    getMe()
      .then((res) => {
        setSocketAuth(token);
        socket.connect();
        setUser(res.user);
      })
      .catch(() => setToken(null))
      .finally(() => setAuthReady(true));
  }, []);

  // ---- Initial data load ---------------------------------------------------
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [s, l, lg, st] = await Promise.all([
        getStores(),
        getLaptops(),
        getTransferLogs(),
        getSettings()
      ]);
      setStores(s);
      setLaptops(l);
      setLogs(lg);
      setLabels(st);
    };
    load().catch((e) => notify(e.message, 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ---- Refetch laptops whenever a filter changes ---------------------------
  const refresh = useCallback(async () => {
    try {
      setLaptops(await getLaptops({ storeId, status, search }));
    } catch (e) {
      notify(e.message, 'error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, status, search]);

  useEffect(() => {
    if (user) refresh();
  }, [refresh, user]);

  // ---- Real-time socket listeners -----------------------------------------
  useEffect(() => {
    if (!user) return;
    const onTransfer = (payload) => {
      setLaptops((prev) => {
        const idx = prev.findIndex((l) => l.id === payload.laptop.id);
        if (idx === -1) return prev;
        const next = prev.slice();
        next[idx] = { ...payload.laptop };
        return next;
      });
      setLogs((prev) => [
        {
          laptop_id: payload.laptop.id,
          brand_model: payload.laptop.brand_model,
          serial_number: payload.laptop.serial_number,
          from_store_name: payload.from?.store_name,
          to_store_name: payload.to?.store_name,
          changed_at: new Date().toISOString()
        },
        ...prev
      ]);
      notify(
        `In real time: ${payload.laptop.brand_model} moved to ${payload.to?.store_name}`,
        'success'
      );
    };

    socket.on('laptop:transferred', onTransfer);

    const onCreate = (laptop) => {
      setLaptops((prev) => (prev.some((l) => l.id === laptop.id) ? prev : [laptop, ...prev]));
      notify(`In real time: ${laptop.brand_model} added to inventory`, 'success');
    };

    const onUpdate = (laptop) => {
      setLaptops((prev) => {
        const idx = prev.findIndex((l) => l.id === laptop.id);
        if (idx === -1) return prev;
        const next = prev.slice();
        next[idx] = { ...laptop };
        return next;
      });
      notify(`In real time: ${laptop.brand_model} updated`, 'info');
    };

    const onDelete = ({ id }) => {
      setLaptops((prev) => prev.filter((l) => l.id !== id));
      notify('In real time: a laptop was removed from inventory', 'info');
    };

    socket.on('laptop:created', onCreate);
    socket.on('laptop:updated', onUpdate);
    socket.on('laptop:deleted', onDelete);

    // Store list + settings changed elsewhere — reload in place.
    const reloadStores = async () => {
      try {
        const [s, st] = await Promise.all([getStores(), getSettings()]);
        setStores(s);
        setLabels(st);
      } catch (e) {
        /* ignore transient errors */
      }
    };
    socket.on('store:added', reloadStores);
    socket.on('store:renamed', reloadStores);
    socket.on('store:deleted', reloadStores);
    socket.on('settings:updated', (st) => setLabels(st || {}));

    // Sheets was edited externally (or full reload) — refetch everything.
    const onDataReloaded = async () => {
      try {
        const [s, l, lg, st] = await Promise.all([
          getStores(),
          getLaptops({ storeId, status, search }),
          getTransferLogs(),
          getSettings()
        ]);
        setStores(s);
        setLaptops(l);
        setLogs(lg);
        setLabels(st);
        notify('Data refreshed from Google Sheets', 'info');
      } catch (e) {
        /* ignore transient errors */
      }
    };
    socket.on('data:reloaded', onDataReloaded);

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    return () => {
      socket.off('laptop:transferred', onTransfer);
      socket.off('laptop:created', onCreate);
      socket.off('laptop:updated', onUpdate);
      socket.off('laptop:deleted', onDelete);
      socket.off('store:added', reloadStores);
      socket.off('store:renamed', reloadStores);
      socket.off('store:deleted', reloadStores);
      socket.off('settings:updated');
      socket.off('data:reloaded', onDataReloaded);
      socket.off('connect');
      socket.off('disconnect');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.role, notify]);

  const handleLogout = () => {
    socket.disconnect();
    setSocketAuth(null);
    setToken(null);
    setUser(null);
    setStores([]);
    setLaptops([]);
    setLogs([]);
    setStoreId('');
    setStatus('');
    setSearch('');
  };

  // ---- Transfer action -----------------------------------------------------
  const handleTransfer = async (laptopId, toStoreId) => {
    try {
      await transferLaptop(laptopId, toStoreId);
      notify('Transfer confirmed', 'success');
      await refresh();
    } catch (e) {
      notify(e.message, 'error');
    }
  };

  // ---- Inventory create / update / delete ----------------------------------
  const handleSave = async (form) => {
    try {
      if (invModal?.laptop) {
        await updateLaptop(invModal.laptop.id, {
          brand_model: form.brand_model,
          current_store_id: form.current_store_id ? Number(form.current_store_id) : null,
          status: form.status
        });
        notify('Laptop updated', 'success');
      } else {
        await createLaptop({
          brand_model: form.brand_model,
          serial_number: form.serial_number,
          current_store_id: form.current_store_id ? Number(form.current_store_id) : null,
          status: form.status
        });
        notify('Laptop added to inventory', 'success');
      }
      setInvModal(null);
      await refresh();
      return '';
    } catch (e) {
      return e.message;
    }
  };

  const handleDelete = async (id, brand) => {
    if (!window.confirm(`Remove "${brand}" from inventory?`)) return;
    try {
      await deleteLaptop(id);
      notify('Laptop removed', 'success');
      await refresh();
    } catch (e) {
      notify(e.message, 'error');
    }
  };

  const handleCurrentUserChanged = (updatedUser, token) => {
    setUser(updatedUser);
    if (token) setToken(token);
  };

  // ---- Admin: settings & store management ----------------------------------
  const handleSaveSettings = async (patch) => {
    try {
      const st = await saveSettings(patch);
      setLabels(st);
      return '';
    } catch (e) {
      return e.message;
    }
  };

  const handleSaveStore = async ({ id, store_name }) => {
    try {
      if (id) {
        await renameStore(id, store_name);
      } else {
        await addStore(store_name);
      }
      const [s, st] = await Promise.all([getStores(), getSettings()]);
      setStores(s);
      setLabels(st);
      return '';
    } catch (e) {
      return e.message;
    }
  };

  const handleDeleteStore = async (id) => {
    try {
      await deleteStore(id);
      const [s, st] = await Promise.all([getStores(), getSettings()]);
      setStores(s);
      setLabels(st);
      return '';
    } catch (e) {
      return e.message;
    }
  };

  // Counts badge for the store filter.
  const storeCount = (id) =>
    id === 'all'
      ? laptops.length
      : laptops.filter((l) => l.current_store_id === id).length;

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-400">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return <Login onSuccess={(token, u) => handleAuth(token, u, null)} />;
  }

  return (
    <LabelsProvider labels={labels}>
      <div className="min-h-screen bg-slate-50">
        {/* Header */}
        <header className="bg-slate-900 text-white">
          <div className="mx-auto max-w-7xl px-4 py-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-bold tracking-tight">{labels.appTitle || 'Laptop Inventory Tracker'}</h1>
              <p className="text-sm text-slate-400 mt-0.5">
                {labels.appSubtitle || 'Real-time location tracking across 7 retail stores'}
              </p>
            </div>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium ${
                connected ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-red-400 animate-pulse'}`}
              />
              {connected ? 'Live · synced' : 'Reconnecting…'}
            </span>

            <div className="flex items-center gap-2 rounded-full bg-white/10 py-1 pl-1 pr-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 font-semibold uppercase">
                {(user.display_name || user.username).slice(0, 1)}
              </span>
              <div className="leading-tight">
                <p className="font-medium">{user.display_name || user.username}</p>
                <p className="text-[10px] uppercase tracking-wide text-slate-300">{user.role}</p>
              </div>
              {isAdmin && (
                <button
                  onClick={() => setAccountsOpen(true)}
                  className="ml-2 rounded-full bg-white/10 px-3 py-1 font-medium text-white hover:bg-white/20"
                >
                  Accounts
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="ml-1 rounded-full bg-white/10 px-3 py-1 font-medium text-white hover:bg-white/20"
                >
                  Settings
                </button>
              )}
              <button
                onClick={handleLogout}
                className="rounded-full bg-white/10 px-3 py-1 font-medium text-white hover:bg-red-500/80"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 space-y-6">
        {/* Sidebar-style filter + toolbar */}
        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <aside className="lg:sticky lg:top-6 self-start">
            <StoreFilter
              stores={stores}
              storeId={storeId}
              setStoreId={setStoreId}
              countFor={storeCount}
              status={status}
              setStatus={setStatus}
            />
          </aside>

          <section className="space-y-4 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Toolbar search={search} setSearch={setSearch} resultCount={laptops.length} />
              {canEdit && (
                <button
                  onClick={() => setInvModal({})}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500"
                >
                  {labels.addInventoryButton || '+ Update Inventory'}
                </button>
              )}
            </div>
            <LaptopTable
              laptops={laptops}
              stores={stores}
              canEdit={canEdit}
              onTransfer={handleTransfer}
              onEdit={(laptop) => setInvModal({ laptop })}
              onDelete={handleDelete}
            />
          </section>
        </div>

        <HistoryLog logs={logs} />
      </main>

      {invModal && (
        <InventoryModal
          stores={stores}
          editing={invModal.laptop}
          onSave={handleSave}
          onClose={() => setInvModal(null)}
        />
      )}

      {accountsOpen && isAdmin && (
        <AccountManager
          currentUser={user}
          onClose={() => setAccountsOpen(false)}
          onCurrentUserChanged={handleCurrentUserChanged}
        />
      )}

      {settingsOpen && isAdmin && (
        <AdminSettings
          stores={stores}
          settings={labels}
          onSaveSettings={handleSaveSettings}
          onSaveStore={handleSaveStore}
          onDeleteStore={handleDeleteStore}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {toast && <Toast key={toast.id} msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      </div>
    </LabelsProvider>
  );
}