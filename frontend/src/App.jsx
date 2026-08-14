import { useEffect, useState, useCallback, useRef } from 'react';
import {
  getStores,
  getLaptops,
  getTransferLogs,
  transferLaptop,
  createLaptop,
  updateLaptop,
  deleteLaptop,
  sellLaptop,
  getRepairs,
  getRepairsSummary,
  createRepair,
  updateRepair,
  deleteRepair,
  getPurchases,
  getPurchasesSummary,
  createPurchase,
  updatePurchase,
  deletePurchase,
  getBrands,
  getVendors,
  getCustomers,
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
import Toast from './components/Toast';
import DangerConfirmModal from './components/DangerConfirmModal';
import InventoryModal from './components/InventoryModal';
import SalesTab from './components/SalesTab';
import AdminSettings from './components/AdminSettings';
import BrandsManager from './components/BrandsManager';
import VendorsManager from './components/VendorsManager';
import CustomersManager from './components/CustomersManager';
import SellModal from './components/SellModal';
import TransferHistoryTab from './components/TransferHistoryTab';
import DashboardTab from './components/DashboardTab';
import ReportsTab from './components/ReportsTab';
import PurchasesTab from './components/PurchasesTab';
import RepairsTab from './components/RepairsTab';
import RepairModal from './components/RepairModal';
import PurchaseModal from './components/PurchaseModal';

const MENU_ICONS = {
  dashboard: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm9 0a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1h-5a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1v-5zm9 0a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1h-5a1 1 0 01-1-1v-5z" />
    </svg>
  ),
  settings: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  brands: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
    </svg>
  ),
  vendors: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  stores: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" />
    </svg>
  ),
  logout: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  )
};

function MenuRow({ label, icon, onClick, danger = false }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors duration-150 ${
        danger ? 'text-stock-risk hover:bg-stock-risk/10' : 'text-ink-dim hover:bg-surface-2 hover:text-ink'
      }`}
    >
      <span className={`shrink-0 ${danger ? 'text-stock-risk' : 'text-accent'}`}>{MENU_ICONS[icon]}</span>
      {label}
    </button>
  );
}

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
  const [purchases, setPurchases] = useState([]);
  const [purchasesSummary, setPurchasesSummary] = useState(null);
  const [repairs, setRepairs] = useState([]);
  const [repairsSummary, setRepairsSummary] = useState(null);

  // Filters / state
  const [storeId, setStoreId] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('dashboard');

  // Inventory pagination: 9 rows/page on mobile, 16 on desktop (user-selectable).
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches ? 9 : 16
  );

  // Toast / sync notifications
  const [toast, setToast] = useState(null);
  const [connected, setConnected] = useState(false);

  // Modals: null = closed
  const [invModal, setInvModal] = useState(null);
  const [purchaseModal, setPurchaseModal] = useState(null); // null | {} | { purchase }
  const [purchaseDelTarget, setPurchaseDelTarget] = useState(null);
  const [repairModal, setRepairModal] = useState(null); // null | {} | { repair }
  const [repairLaptopOptions, setRepairLaptopOptions] = useState([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [brandsOpen, setBrandsOpen] = useState(false);
  const [vendorsOpen, setVendorsOpen] = useState(false);
  const [customersOpen, setCustomersOpen] = useState(false);
  const [sellTarget, setSellTarget] = useState(null); // laptop about to be sold
  const [delTarget, setDelTarget] = useState(null); // { id, label } scheduled for deletion
  const [repairDelTarget, setRepairDelTarget] = useState(null); // repair scheduled for deletion
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Close the 3-dot menu on outside click / Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const pick = (action) => {
    setMenuOpen(false);
    action();
  };

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
      reloadPurchases();
      reloadRepairs();
    };
    load().catch((e) => notify(e.message, 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Purchases ledger: track totals for the dashboard square + Purchases tab.
  const reloadPurchases = useCallback(async () => {
    try {
      const [list, sum] = await Promise.all([getPurchases(), getPurchasesSummary()]);
      setPurchases(list);
      setPurchasesSummary(sum);
    } catch (e) {
      /* transient */
    }
  }, []);

  // Repairs: list + counts, refreshed on every realtime change.
  const reloadRepairs = useCallback(async () => {
    try {
      const [list, sum] = await Promise.all([getRepairs(), getRepairsSummary()]);
      setRepairs(list);
      setRepairsSummary(sum);
    } catch (e) {
      /* transient */
    }
  }, []);

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

  // Jump back to page 1 whenever the filter set or page size changes.
  useEffect(() => {
    setPage(1);
  }, [storeId, status, search, pageSize]);

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
      reloadPurchases();
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
      reloadPurchases();
    };

    socket.on('laptop:created', onCreate);

    const onBulk = (list) => {
      setLaptops((prev) => {
        const known = new Set(prev.map((l) => l.id));
        const fresh = (list || []).filter((l) => !known.has(l.id));
        return fresh.length ? [...fresh, ...prev] : prev;
      });
      notify(`In real time: ${(list || []).length} units added to inventory`, 'success');
      reloadPurchases();
    };
    socket.on('laptop:bulk', onBulk);

    const onSale = (sale) => {
      notify(`In real time: ${sale?.brand_model} sold for ₹${Number(sale?.sale_price || 0).toLocaleString('en-IN')}`, 'success');
    };
    socket.on('sale:new', onSale);

    const onRepairsChanged = () => reloadRepairs();
    socket.on('repairs:updated', onRepairsChanged);

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
        reloadPurchases();
        reloadRepairs();
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
      socket.off('repairs:updated', onRepairsChanged);
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
    setPurchases([]);
    setPurchasesSummary(null);
    setRepairs([]);
    setRepairsSummary(null);
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
        product_line: form.product_line,
        brand_model: form.brand_model,
        processor_type: form.processor_type,
        ram: form.ram,
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
      reloadPurchases();
      return '';
    } catch (e) {
      return e.message;
    }
  };

  // ---- Repair create / update / delete -------------------------------------
  const openRepairModal = (repair) => {
    getLaptops()
      .then(setRepairLaptopOptions)
      .catch(() => setRepairLaptopOptions([]));
    setRepairModal(repair ? { repair } : {});
  };

  const handleRepairSave = async (form) => {
    try {
      const payload = {
        laptop_id: form.laptop_id ? Number(form.laptop_id) : null,
        serial_number: form.serial_number,
        brand_model: form.brand_model,
        issue: form.issue,
        vendor: form.vendor,
        cost: form.cost === '' || form.cost == null ? 0 : Number(form.cost),
        charge: form.charge === '' || form.charge == null ? 0 : Number(form.charge),
        store_id: form.store_id === '' || form.store_id == null ? null : Number(form.store_id),
        status: form.status,
        notes: form.notes
      };
      if (repairModal?.repair) {
        await updateRepair(repairModal.repair.id, payload);
        notify('Repair updated', 'success');
      } else {
        await createRepair(payload);
        notify('Repair added', 'success');
      }
      setRepairModal(null);
      await reloadRepairs();
      return '';
    } catch (e) {
      return e.message;
    }
  };

  const handleRepairDelete = (repair) => {
    setRepairDelTarget(repair);
  };

  const handleRepairDeleteConfirm = async (pwd, remarks) => {
    const r = repairDelTarget;
    if (!r) return '';
    try {
      await deleteRepair(r.id, pwd, remarks);
      notify('Repair removed', 'success');
      setRepairDelTarget(null);
      await reloadRepairs();
      return '';
    } catch (e) {
      return e.message;
    }
  };

  // ---- Purchase ledger create / update / delete -----------------------------
  const handlePurchaseSave = async (form) => {
    try {
      const payload = {
        purchased_at: form.purchased_at || '',
        brand: form.brand,
        brand_model: form.brand_model,
        serial_number: form.serial_number,
        processor: form.processor,
        generation: form.generation,
        ram: form.ram,
        storage: form.storage,
        graphics: form.graphics,
        purchased_from: form.purchased_from,
        purchase_rate: form.purchase_rate === '' || form.purchase_rate == null ? 0 : Number(form.purchase_rate),
        extra_charges: form.extra_charges === '' || form.extra_charges == null ? 0 : Number(form.extra_charges),
        quantity: Number(form.quantity) || 1,
        current_store_id: form.current_store_id ? Number(form.current_store_id) : null,
        status: form.status || 'In Stock',
        comment: form.comment
      };
      if (purchaseModal?.purchase) {
        await updatePurchase(purchaseModal.purchase.id, payload);
        notify('Purchase updated', 'success');
      } else {
        await createPurchase(payload);
        notify('Purchase recorded', 'success');
      }
      setPurchaseModal(null);
      await reloadPurchases();
      return '';
    } catch (e) {
      return e.message;
    }
  };

  const handlePurchaseDelete = (purchase) => {
    setPurchaseDelTarget(purchase);
  };

  const handlePurchaseDeleteConfirm = async (pwd, remarks) => {
    const r = purchaseDelTarget;
    if (!r) return '';
    try {
      await deletePurchase(r.id, pwd, remarks);
      notify('Purchase removed', 'success');
      setPurchaseDelTarget(null);
      await reloadPurchases();
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
      reloadPurchases();
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
    setDelTarget({ id, label: brand });
  };

  const handleDeleteConfirm = async (pwd, remarks) => {
    const t = delTarget;
    if (!t) return '';
    try {
      await deleteLaptop(t.id, pwd, remarks);
      notify('Laptop removed', 'success');
      setDelTarget(null);
      await refresh();
      reloadPurchases();
      return '';
    } catch (e) {
      return e.message;
    }
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

  const handleDeleteStore = async (id, password = '', remarks = '') => {
    try {
      await deleteStore(id, password, remarks);
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

  // Client-side pagination of the (already filtered) inventory list.
  const totalPages = Math.max(1, Math.ceil(laptops.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const from = laptops.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const pageRows = laptops.slice((currentPage - 1) * pageSize, currentPage * pageSize);

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
        <header className="sticky top-0 z-40 border-b border-line bg-page/80 backdrop-blur-md">
          <div className="mx-auto max-w-[1440px] px-4 h-14 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setTab('dashboard')}
              className="flex items-center gap-3 min-w-0 text-left transition-opacity duration-150 hover:opacity-80"
              title="Go to dashboard"
            >
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
            </button>
          </div>
          <div className="flex items-center justify-end gap-2 text-xs min-w-0">
            <span
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium ${
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

            <span className="flex items-center gap-1 rounded-full border border-line bg-surface p-1">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft font-display text-xs font-semibold text-accent">
                {(user.display_name || user.username).slice(0, 1)}
              </span>
              <span className="hidden md:block leading-tight px-1">
                <span className="block max-w-[120px] truncate text-xs font-medium text-ink">{user.display_name || user.username}</span>
                <span className="block text-[10px] uppercase tracking-wide text-ink-faint">{user.role}</span>
              </span>
            </span>

            {/* 3-dot menu — top-right corner */}
            <div className="relative shrink-0" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                aria-label="Menu"
                aria-expanded={menuOpen}
                className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors duration-150 ${
                  menuOpen
                    ? 'border-accent-line bg-accent-soft text-accent'
                    : 'border-line bg-surface text-ink-dim hover:bg-surface-2 hover:text-ink'
                }`}
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 16 16">
                  <circle cx="8" cy="3" r="1.5" />
                  <circle cx="8" cy="8" r="1.5" />
                  <circle cx="8" cy="13" r="1.5" />
                </svg>
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-2xl border border-line bg-surface p-1.5 shadow-pop animate-rise">
                  <p className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                    {(user.display_name || user.username).slice(0, 1)} — {user.role}
                  </p>
                  <div className="mb-1 border-b border-line" />
                  <MenuRow
                    label="Dashboard"
                    icon="dashboard"
                    onClick={() => pick(() => setTab('dashboard'))}
                  />
                  {isAdmin && (
                    <MenuRow label="Settings" icon="settings" onClick={() => pick(() => setSettingsOpen(true))} />
                  )}
                  {isAdmin && (
                    <MenuRow label="Brands" icon="brands" onClick={() => pick(() => setBrandsOpen(true))} />
                  )}
                  {canManageVendors && (
                    <MenuRow label="Vendors" icon="vendors" onClick={() => pick(() => setVendorsOpen(true))} />
                  )}
                  {!isAdmin && canRenameStores && (
                    <MenuRow label="Stores" icon="stores" onClick={() => pick(() => setSettingsOpen(true))} />
                  )}
                  <div className="my-1 border-t border-line" />
                  <MenuRow label="Sign out" icon="logout" danger onClick={handleLogout} />
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

<main className="mx-auto max-w-[1440px] px-4 py-6 space-y-6">
        {tab === 'dashboard' ? (
          <DashboardTab
            laptops={laptops}
            logs={logs}
            customers={customers}
            purchases={purchases}
            repairs={repairs}
            onNavigate={setTab}
          />
        ) : tab === 'inventory' ? (
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
              laptops={pageRows}
              stores={stores}
              canEdit={canEditInventory}
              canTransfer={canTransfer}
              canSell={canEditInventory}
              canManageCustomers={canManageCustomers}
              showSensitive={isAdmin}
              onTransfer={handleTransfer}
              onSell={handleSell}
              onEdit={(laptop) => setInvModal({ laptop })}
              onDelete={handleDelete}
            />
            {laptops.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 px-1">
                <div className="flex items-center gap-2 text-xs text-ink-dim">
                  <span className="text-ink-faint">Rows per page</span>
                  {[9, 16].map((n) => (
                    <button
                      key={n}
                      onClick={() => setPageSize(n)}
                      className={`rounded-full border px-2.5 py-1 font-medium transition-colors ${
                        pageSize === n
                          ? 'border-accent-line bg-accent-soft text-accent'
                          : 'border-line bg-surface text-ink-dim hover:text-ink'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                  <span className="ml-2 font-mono text-ink-faint">
                    Showing {from}–{Math.min(laptops.length, currentPage * pageSize)} of {laptops.length}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(currentPage - 1)}
                    disabled={currentPage <= 1}
                    className="btn-ghost disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    ← Prev
                  </button>
                  <span className="font-mono text-xs text-ink-dim">
                    Page {currentPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                    className="btn-ghost disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
        ) : tab === 'purchases' ? (
          <PurchasesTab
            purchases={purchases}
            summary={purchasesSummary}
            canEditInventory={canEditInventory}
            onAddPurchase={() => setPurchaseModal({})}
            onEditPurchase={(purchase) => setPurchaseModal({ purchase })}
            onDeletePurchase={handlePurchaseDelete}
          />
        ) : tab === 'repairs' ? (
          <RepairsTab
            repairs={repairs}
            canEditInventory={canEditInventory}
            onAdd={() => openRepairModal(null)}
            onEdit={(repair) => openRepairModal(repair)}
            onDelete={handleRepairDelete}
          />
        ) : tab === 'sales' ? (
          <SalesTab stores={stores} isSuperAdmin={isSuperAdmin} canSeeCustomer={isAdmin} onNotify={notify} />
        ) : tab === 'customers' ? (
          <div className="space-y-4">
            <p className="text-sm text-ink-dim">Manage your customers. Linked to sales when a laptop is sold to them.</p>
            <CustomersManager onNotify={notify} />
          </div>
) : tab === 'stats' ? (
          <ReportsTab stores={stores} logs={logs} laptops={laptops} isAdmin={isAdmin} homeStoreId={user?.home_store_id ?? null} />
        ) : tab === 'transfers' ? (
          <TransferHistoryTab stores={stores} />
        ) : (
          <SalesTab stores={stores} isSuperAdmin={isSuperAdmin} canSeeCustomer={isAdmin} onNotify={notify} />
        )}
      </main>

      {invModal && (
        <InventoryModal
          stores={stores}
          brands={brands}
          vendors={vendors}
          editing={invModal.laptop}
          isAdmin={isAdmin}
          onSave={handleSave}
          onClose={() => setInvModal(null)}
        />
      )}

      {purchaseModal && (
        <PurchaseModal
          stores={stores}
          editing={purchaseModal.purchase}
          onSave={handlePurchaseSave}
          onClose={() => setPurchaseModal(null)}
        />
      )}

      {purchaseDelTarget && (
        <DangerConfirmModal
          title="Delete this purchase record?"
          warning={`The purchase record for "${purchaseDelTarget.brand_model || purchaseDelTarget.brand || '#' + purchaseDelTarget.id}" will be permanently removed from the ledger. This cannot be undone.`}
          onConfirm={handlePurchaseDeleteConfirm}
          onClose={() => setPurchaseDelTarget(null)}
        />
      )}

      {delTarget && (
        <DangerConfirmModal
          title="Delete this laptop?"
          warning={`"${delTarget.label}" will be permanently removed from inventory along with its transfer history. This cannot be undone.`}
          onConfirm={handleDeleteConfirm}
          onClose={() => setDelTarget(null)}
        />
      )}

      {repairDelTarget && (
        <DangerConfirmModal
          title="Delete this repair?"
          warning={`The repair record for "${repairDelTarget.brand_model || repairDelTarget.serial_number || '#' + repairDelTarget.id}" will be permanently removed. This cannot be undone.`}
          onConfirm={handleRepairDeleteConfirm}
          onClose={() => setRepairDelTarget(null)}
        />
      )}

      {repairModal && (
        <RepairModal
          editing={repairModal.repair}
          laptops={repairLaptopOptions}
          stores={stores}
          homeStoreId={user?.home_store_id ?? null}
          onSave={handleRepairSave}
          onClose={() => setRepairModal(null)}
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
