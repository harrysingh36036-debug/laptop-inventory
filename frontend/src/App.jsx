import { useEffect, useState, useCallback } from 'react';
import {
  getStores,
  getLaptops,
  getTransferLogs,
  transferLaptop,
  createLaptop,
  updateLaptop,
  deleteLaptop,
  sellLaptop,
  getBrands,
  getVendors,
  getCustomers,
  getInventoryStats,
  addCustomer,
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
import SalesTab from './components/SalesTab';
import AccountManager from './components/AccountManager';
import AdminSettings from './components/AdminSettings';
import BrandsManager from './components/BrandsManager';
import VendorsManager from './components/VendorsManager';
import CustomersManager from './components/CustomersManager';
import InventoryStats from './components/InventoryStats';
import SellModal from './components/SellModal';
import TransferHistoryTab from './components/TransferHistoryTab';
import Toast from './components/Toast';

export default function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  const [stores, setStores] = useState([]);
  const [laptops, setLaptops] = useState([]);
  const [logs, setLogs] = useState([]);
  const [labels, setLabels] = useState({});
  const [brands, setBrands] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [customers, setCustomers] = useState([]);

  // Filters / state
  const [storeId, setStoreId] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('inventory');

  // Toast / sync notifications
  const [toast, setToast] = useState(null);
  const [connected, setConnected] = useState(false);

  // Modals: null = closed
  const [invModal, setInvModal] = useState(null);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [brandsOpen, setBrandsOpen] = useState(false);
  const [vendorsOpen, setVendorsOpen] = useState(false);
  const [customersOpen, setCustomersOpen] = useState(false);
  const [sellTarget, setSellTarget] = useState(null); // laptop about to be sold

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
  const isSuperAdmin = user?.role === 'superadmin';

  // Admin-configurable permissions (parsed from settings).
  const rolePerms = (() => {
    try {
      return JSON.parse(labels.role_permissions || 'null') || null;
    } catch {
      return null;
    }
  })();
  const defaultPerms = {
    manager: { editInventory: true, transferLaptops: true, createStaff: true, renameStores: true, editLabels: false, manageVendors: false, manageCustomers: false },
    staff: { editInventory: false, transferLaptops: false, createStaff: false, renameStores: false, editLabels: false, manageVendors: false, manageCustomers: false }
  };
  const myPerms = rolePerms?.[user?.role] || defaultPerms[user?.role] || {};
  const can = (perm) => (isAdmin ? true : !!myPerms[perm]);
  const canEditInventory = can('editInventory');
  const canTransfer = can('transferLaptops');
  const canCreateStaff = can('createStaff');
  const canRenameStores = can('renameStores');
  // Vendor / Customer management is granted by the super admin — even for admins.
  const canManageVendors = isSuperAdmin || !!((rolePerms || {})[user?.role] || {})['manageVendors'];
  const canManageCustomers = isSuperAdmin || !!((rolePerms || {})[user?.role] || {})['manageCustomers'];

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
      const [s, l, lg, st, b] = await Promise.all([
        getStores(),
        getLaptops(),
        getTransferLogs(),
        getSettings(),
        getBrands().catch(() => [])
      ]);
      setStores(s);
      setLaptops(l);
      setLogs(lg);
      setLabels(st);
      setBrands(b);
      getVendors().then(setVendors).catch(() => {});
      getCustomers().then(setCustomers).catch(() => {});
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

    const onBulk = (list) => {
      setLaptops((prev) => {
        const known = new Set(prev.map((l) => l.id));
        const fresh = (list || []).filter((l) => !known.has(l.id));
        return fresh.length ? [...fresh, ...prev] : prev;
      });
      notify(`In real time: ${(list || []).length} units added to inventory`, 'success');
    };
    socket.on('laptop:bulk', onBulk);

    const onSale = (sale) => {
      notify(`In real time: ${sale?.brand_model} sold for ₹${Number(sale?.sale_price || 0).toLocaleString('en-IN')}`, 'success');
    };
    socket.on('sale:new', onSale);

    const reloadBrands = async () => {
      try {
        setBrands(await getBrands());
      } catch (e) {
        /* ignore */
      }
    };
    socket.on('brands:updated', reloadBrands);
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
    socket.on('permissions:updated', reloadStores);

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
        getBrands().then(setBrands).catch(() => {});
        notify('Data refreshed', 'info');
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
      socket.off('laptop:bulk', onBulk);
      socket.off('sale:new', onSale);
      socket.off('brands:updated', reloadBrands);
      socket.off('laptop:updated', onUpdate);
      socket.off('laptop:deleted', onDelete);
      socket.off('store:added', reloadStores);
      socket.off('store:renamed', reloadStores);
      socket.off('store:deleted', reloadStores);
      socket.off('settings:updated');
      socket.off('permissions:updated', reloadStores);
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
      const payload = {
        brand: form.brand,
        brand_model: form.brand_model,
        processor_type: form.processor_type,
        generation: form.generation,
        storage_type: form.storage_type,
        storage_size: form.storage_size,
        purchased_from: form.purchased_from,
        graphics: form.graphics,
        graphics_type: form.graphics_type,
        graphics_model: form.graphics_model,
        purchase_rate: form.purchase_rate === '' || form.purchase_rate == null ? null : Number(form.purchase_rate),
        extra_charges: form.extra_charges === '' || form.extra_charges == null ? null : Number(form.extra_charges),
        current_store_id: form.current_store_id ? Number(form.current_store_id) : null,
        status: form.status || 'In Stock'
      };
      if (invModal?.laptop) {
        await updateLaptop(invModal.laptop.id, payload);
        notify('Laptop updated', 'success');
      } else if (form.quantity > 1) {
        const res = await createLaptop({ ...payload, quantity: Number(form.quantity), serial_prefix: form.serial_prefix });
        notify(`Added ${res.laptops?.length ?? form.quantity} units`, 'success');
      } else {
        await createLaptop({ ...payload, serial_number: form.serial_number });
        notify('Laptop added to inventory', 'success');
      }
      setInvModal(null);
      await refresh();
      return '';
    } catch (e) {
      return e.message;
    }
  };

  // ---- Sell a laptop --------------------------------------------------------
  const handleSell = (laptop) => {
    setSellTarget(laptop);
  };

  const handleSellConfirm = async (price, { customerId } = {}) => {
    const l = sellTarget;
    setSellTarget(null);
    if (!l) return;
    const num = Number(price);
    if (!Number.isFinite(num) || num < 0) {
      notify('Enter a valid sale price', 'error');
      return;
    }
    try {
      await sellLaptop(l.id, num, customerId);
      notify(
        `Sold ${l.brand_model} for \u20b9${num.toLocaleString('en-IN')}${customerId ? ' (customer recorded)' : ''}`,
        'success'
      );
      await refresh();
      getCustomers().then(setCustomers).catch(() => {});
    } catch (e) {
      notify(e.message, 'error');
    }
  };

  const handleAddCustomer = async (data) => {
    try {
      const c = await addCustomer(data);
      getCustomers().then(setCustomers).catch(() => {});
      return c;
    } catch (e) {
      notify(e.message, 'error');
      return null;
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
      <div className="flex min-h-screen items-center justify-center bg-page">
        <p className="text-sm text-ink-faint">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return <Login onSuccess={(token, u) => handleAuth(token, u, null)} />;
  }

  return (
    <LabelsProvider labels={labels}>
      <div className="min-h-screen bg-page text-ink">
        {/* Header */}
        <header className="sticky top-0 z-40 border-b border-line bg-[#0e0f13]/80 backdrop-blur-md">
          <div className="mx-auto max-w-[1440px] px-4 h-14 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <span className="h-6 w-6 rounded-md bg-accent-soft flex items-center justify-center">
                <svg className="h-3.5 w-3.5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </span>
              <div className="min-w-0">
                <h1 className="truncate font-display text-sm font-semibold tracking-tight">{labels.appTitle || 'Laptop Inventory Tracker'}</h1>
                <p className="hidden sm:block text-[11px] text-ink-faint">
                  {labels.appSubtitle || 'Real-time location tracking across 7 retail stores'}
                </p>
              </div>
            </div>
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium ${
                connected
                  ? 'border-stock-ok/25 bg-stock-ok/10 text-stock-ok'
                  : 'border-stock-risk/25 bg-stock-risk/10 text-stock-risk'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-stock-ok' : 'bg-stock-risk animate-pulse'}`}
              />
              <span className="hidden sm:inline">{connected ? 'Live · synced' : 'Reconnecting…'}</span>
            </span>

            <div className="flex items-center gap-1 rounded-full border border-line bg-surface p-1">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft font-display text-xs font-semibold text-accent">
                {(user.display_name || user.username).slice(0, 1)}
              </span>
              <span className="hidden md:block leading-tight px-1">
                <span className="block max-w-[120px] truncate text-xs font-medium text-ink">{user.display_name || user.username}</span>
                <span className="block text-[10px] uppercase tracking-wide text-ink-faint">{user.role}</span>
              </span>
              {isAdmin && (
                <button
                  onClick={() => setAccountsOpen(true)}
                  className="rounded-full px-2.5 py-1 font-medium text-ink-dim hover:bg-surface-3 hover:text-ink transition-colors"
                >
                  Accounts
                </button>
              )}
              {!isAdmin && canCreateStaff && (
                <button
                  onClick={() => setAccountsOpen(true)}
                  className="rounded-full px-2.5 py-1 font-medium text-ink-dim hover:bg-surface-3 hover:text-ink transition-colors"
                >
                  Accounts
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="rounded-full px-2.5 py-1 font-medium text-ink-dim hover:bg-surface-3 hover:text-ink transition-colors"
                >
                  Settings
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => setBrandsOpen(true)}
                  className="rounded-full px-2.5 py-1 font-medium text-ink-dim hover:bg-surface-3 hover:text-ink transition-colors"
                >
                  Brands
                </button>
              )}
              {canManageVendors && (
                <button
                  onClick={() => setVendorsOpen(true)}
                  className="rounded-full px-2.5 py-1 font-medium text-ink-dim hover:bg-surface-3 hover:text-ink transition-colors"
                >
                  Vendors
                </button>
              )}
              {!isAdmin && canRenameStores && (
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="rounded-full px-2.5 py-1 font-medium text-ink-dim hover:bg-surface-3 hover:text-ink transition-colors"
                >
                  Stores
                </button>
              )}
              <button
                onClick={handleLogout}
                className="rounded-full border border-line px-2.5 py-1 font-medium text-ink-dim hover:text-stock-risk hover:border-stock-risk/40 transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 py-6 space-y-6">
        {/* Tab switcher */}
        <div className="inline-flex items-center gap-1 rounded-xl border border-line bg-surface p-1">
          <button
            onClick={() => setTab('inventory')}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors duration-150 ${
              tab === 'inventory'
                ? 'bg-surface-3 text-ink shadow-[0_1px_2px_rgba(0,0,0,0.4)]'
                : 'text-ink-dim hover:text-ink'
            }`}
          >
            Inventory
          </button>
          <button
            onClick={() => setTab('sales')}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors duration-150 ${
              tab === 'sales'
                ? 'bg-surface-3 text-ink shadow-[0_1px_2px_rgba(0,0,0,0.4)]'
                : 'text-ink-dim hover:text-ink'
            }`}
          >
            Sales & Profit
          </button>
          {canManageCustomers && (
            <button
              onClick={() => setTab('customers')}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors duration-150 ${
                tab === 'customers'
                  ? 'bg-surface-3 text-ink shadow-[0_1px_2px_rgba(0,0,0,0.4)]'
                  : 'text-ink-dim hover:text-ink'
              }`}
            >
              Customers
            </button>
          )}
          <button
            onClick={() => setTab('stats')}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors duration-150 ${
              tab === 'stats'
                ? 'bg-surface-3 text-ink shadow-[0_1px_2px_rgba(0,0,0,0.4)]'
                : 'text-ink-dim hover:text-ink'
            }`}
          >
             Brand &amp; Stock View
          </button>
          <button
            onClick={() => setTab('transfers')}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors duration-150 ${
              tab === 'transfers'
                ? 'bg-surface-3 text-ink shadow-[0_1px_2px_rgba(0,0,0,0.4)]'
                : 'text-ink-dim hover:text-ink'
            }`}
          >
            Transfer History
          </button>
        </div>

        {tab === 'inventory' ? (
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
              {canEditInventory && (
                <button
                  onClick={() => setInvModal({})}
                  className="btn-accent"
                >
                  {labels.addInventoryButton || '+ Update Inventory'}
                </button>
              )}
            </div>
            <LaptopTable
              laptops={laptops}
              stores={stores}
              canEdit={canEditInventory}
              canTransfer={canTransfer}
              canSell={canEditInventory}
              canManageCustomers={canManageCustomers}
              onTransfer={handleTransfer}
              onSell={handleSell}
              onEdit={(laptop) => setInvModal({ laptop })}
              onDelete={handleDelete}
            />
          </section>
        </div>
        ) : tab === 'sales' ? (
          <SalesTab stores={stores} />
        ) : tab === 'customers' ? (
          <div className="space-y-4">
            <p className="text-sm text-ink-dim">Manage your customers. Linked to sales when a laptop is sold to them.</p>
            <CustomersManager onNotify={notify} />
          </div>
         ) : tab === 'stats' ? (
          <InventoryStats stores={stores} />
        ) : tab === 'transfers' ? (
          <TransferHistoryTab stores={stores} />
        ) : (
          <SalesTab stores={stores} />
        )}

        <HistoryLog logs={logs} />
      </main>

      {invModal && (
        <InventoryModal
          stores={stores}
          brands={brands}
          vendors={vendors}
          editing={invModal.laptop}
          onSave={handleSave}
          onClose={() => setInvModal(null)}
        />
      )}

      {brandsOpen && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-pop animate-rise">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-base font-semibold tracking-tight text-ink">Manage Brands</h2>
              <button onClick={() => setBrandsOpen(false)} className="text-ink-faint hover:text-ink transition-colors" aria-label="Close">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <BrandsManager onNotify={notify} />
          </div>
        </div>
      )}

      {vendorsOpen && canManageVendors && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-pop animate-rise">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-base font-semibold tracking-tight text-ink">Manage Vendors</h2>
              <button onClick={() => setVendorsOpen(false)} className="text-ink-faint hover:text-ink transition-colors" aria-label="Close">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <VendorsManager onNotify={notify} />
          </div>
        </div>
      )}

      {accountsOpen && (isAdmin || canCreateStaff) && (
        <AccountManager
          currentUser={user}
          onClose={() => setAccountsOpen(false)}
          onCurrentUserChanged={handleCurrentUserChanged}
        />
      )}

      {settingsOpen && (isAdmin || canRenameStores) && (
        <AdminSettings
          stores={stores}
          settings={labels}
          isAdmin={isAdmin}
          isSuperAdmin={isSuperAdmin}
          onSaveSettings={handleSaveSettings}
          onSaveStore={handleSaveStore}
          onDeleteStore={handleDeleteStore}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {sellTarget && (
        <SellModal
          open={!!sellTarget}
          laptop={sellTarget}
          customers={customers}
          onAddCustomer={handleAddCustomer}
          onSave={handleSellConfirm}
          onClose={() => setSellTarget(null)}
        />
      )}

      {toast && <Toast key={toast.id} msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      </div>
    </LabelsProvider>
  );
}