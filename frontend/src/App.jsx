import { useEffect, useState, useCallback, useRef, lazy, Suspense } from 'react';
import {
  getStores,
  getLaptops,
  getTransferLogs,
  initiateTransfer,
  acceptTransfer,
  rejectTransfer,
  cancelTransfer,
  getPendingTransfers,
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
import { socket, setSocketAuth, setLocalRole, setLocalPII } from './socket';
import { joinPresence, leavePresence } from './presence';
import { LabelsProvider, DEFAULT_LABELS } from './labels.jsx';
import Login from './components/Login';
import StoreFilter from './components/StoreFilter';
import InventoryView from './components/InventoryView';
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
import PurchasesTab from './components/PurchasesTab';
import VendorLaptopsTab from './components/VendorLaptopsTab';
import RepairsTab from './components/RepairsTab';
import DataAuditTab from './components/DataAuditTab';
import RepairModal from './components/RepairModal';
import PurchaseModal from './components/PurchaseModal';
import QuickBall from './components/QuickBall';


const ReportsTab = lazy(() => import('./components/ReportsTab'));

let _audioCtx = null;
function getAudioCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}
function initAudioOnInteraction() {
  const unlock = () => { getAudioCtx(); window.removeEventListener('click', unlock); window.removeEventListener('keydown', unlock); };
  window.addEventListener('click', unlock);
  window.addEventListener('keydown', unlock);
}
initAudioOnInteraction();

function playTransferSound() {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch { /* audio not available */ }
}

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
      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium transition-all duration-200 ease-out hover:translate-x-0.5 active:scale-[0.98] ${
        danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
      }`}
    >
      <span className={`shrink-0 ${danger ? 'text-red-600' : 'text-blue-600'}`}>{MENU_ICONS[icon]}</span>
      {label}
    </button>
  );
}

export const buildNavItems = (t = {}) => [
  {
    key: 'dashboard',
    label: t.navDashboard || 'Dashboard',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm9 0a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1h-5a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1v-5zm9 0a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1h-5a1 1 0 01-1-1v-5z" />
      </svg>
    )
  },
  {
    key: 'inventory',
    label: t.navInventory || 'Inventory',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
        <rect x="4" y="5" width="16" height="11" rx="1.5" />
        <path strokeLinecap="round" d="M2 19h20M9 16v3m6-3v3" />
      </svg>
    )
  },
  {
    key: 'transfers',
    label: t.navTransfers || 'Transfers',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 4v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    )
  },
  {
    key: 'purchases',
    label: t.navPurchases || 'Purchases',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h2l2.4 12.2a1 1 0 001 .8h9.2a1 1 0 001-.8L21 8H6" />
        <circle cx="9" cy="20" r="1.3" />
        <circle cx="18" cy="20" r="1.3" />
      </svg>
    )
  },
  {
    key: 'repairs',
    label: t.navRepairs || 'Repairs',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.83-5.83M3.75 5.25a4.5 4.5 0 016.36 0l4.5 4.5a4.5 4.5 0 010 6.36M3.75 5.25l4.5 4.5" />
      </svg>
    )
  },
  {
    key: 'sales',
    label: t.navSold || 'Sold',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 5h7M8 5v14M8 12h6a3 3 0 000-6H8m0 6h6a3 3 0 010 6H8" />
      </svg>
    )
  },
  {
    key: 'customers',
    label: t.navCustomers || 'Customers',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 12a4 4 0 100-8 4 4 0 000 8zM4 20a8 8 0 0116 0" />
      </svg>
    )
  },
  {
    key: 'stats',
    label: t.navReports || 'Reports',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </svg>
    )
  },
  {
    key: 'vendor-laptops',
    label: t.navVendorLaptops || 'Vendor Laptops',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V5a2 2 0 012-2h2a2 2 0 012 2v14m6-8v8m0-8v8m6-4h-8l-4-4m4 4V4" />
      </svg>
    )
  }
];

function QuickNav({ tab, onNavigate, items = [] }) {
  const railRef = useRef(null);
  useEffect(() => {
    const el = railRef.current?.querySelector(`[data-nav="${tab}"]`);
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [tab]);
  return (
    <nav className="sticky top-14 z-30 border-b border-gray-200 bg-page/85 backdrop-blur-md">
      <div className="mx-auto max-w-[1440px] px-3">
        <div ref={railRef} className="no-scrollbar flex justify-center gap-1 overflow-x-auto py-2">
          {items.map((it) => {
            const active = tab === it.key;
            return (
              <button
                key={it.key}
                data-nav={it.key}
                onClick={() => onNavigate(it.key)}
                aria-current={active ? 'page' : undefined}
                className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-[15px] font-bold ${
                  active
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <span className="h-4 w-4 shrink-0">{it.icon}</span>
                {it.label}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
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
  const [pendingTransfers, setPendingTransfers] = useState([]);
  const [shownTransferIds, setShownTransferIds] = useState(new Set());
  const [activeTransferPopup, setActiveTransferPopup] = useState(null);

  // Filters / state
  const [storeId, setStoreId] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('dashboard');
  const [reportsViewOpen, setReportsViewOpen] = useState(false);

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

  const handleFocusLaptop = (laptop) => {
    if (laptop.current_store_id != null) {
      setStoreId(String(laptop.current_store_id));
      setStatus('');
      setSearch(laptop.serial_number || laptop.brand_model || '');
      setTab('inventory');
    } else if (laptop.purchased_from) {
      setSearch(laptop.serial_number || laptop.brand_model || '');
      setTab('vendor-laptops');
    }
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
    manager: { editInventory: true, transferLaptops: true, createStaff: true, renameStores: true, editLabels: false, manageVendors: false, manageCustomers: false, viewPII: false },
    staff: { editInventory: false, transferLaptops: false, createStaff: false, renameStores: false, editLabels: false, manageVendors: false, manageCustomers: false, viewPII: false }
  };
  const myPerms = rolePerms?.[user?.role] || defaultPerms[user?.role] || {};
  const can = (perm) => (isAdmin ? true : !!myPerms[perm]);
  const canEditInventory = can('editInventory');
  const canTransfer = can('transferLaptops');
  const canRenameStores = can('renameStores');
  // PII (purchaser name / phone / Aadhar) is admin-aligned: admins always see
  // it; managers and staff only when the admin grants the "View PII" permission.
  const canViewPII = isAdmin || can('viewPII');

  // Keep the realtime bridge's PII masking in sync with the current permission.
  useEffect(() => {
    setLocalPII(canViewPII);
  }, [canViewPII]);
  // Vendor / Customer management is granted by the super admin — even for admins.
  const canManageVendors = isSuperAdmin || !!((rolePerms || {})[user?.role] || {})['manageVendors'];
  const canManageCustomers = isSuperAdmin || !!((rolePerms || {})[user?.role] || {})['manageCustomers'];

  const notify = useCallback((msg, type = 'info') => {
    setToast({ msg, type, id: Date.now() });
  }, []);

  const handleAuth = useCallback((token, nextUser, current = user) => {
    setToken(token);
    setSocketAuth(token);
    setLocalRole(nextUser.role);
    if (nextUser.role !== current?.role || nextUser.id !== current?.id) socket.connect();
    setUser(nextUser);
    joinPresence(nextUser);
  }, [user]);

  // Keep live presence in sync — who is currently active/logged in
  useEffect(() => {
    if (user) joinPresence(user);
    else leavePresence();
    return () => {
      // channel cleanup handled inside presence.js; also leave when user id changes
    };
  }, [user?.id]);

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
        setLocalRole(res.user.role);
        socket.connect();
        setUser(res.user);
        joinPresence(res.user);
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
        getTransferLogs().catch(() => []),
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
      reloadPendingTransfers();
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

  const reloadPendingTransfers = useCallback(async () => {
    try {
      setPendingTransfers(await getPendingTransfers());
    } catch (e) {
      /* transient */
    }
  }, []);

  // Show popup when a new pending transfer arrives for this user's store
  const pendingQueueRef = useRef([]);
  useEffect(() => {
    if (!pendingTransfers.length || !user?.home_store_id) return;
    const newIncoming = pendingTransfers.filter(
      (pt) => Number(pt.to_store_id) === Number(user.home_store_id) && !shownTransferIds.has(pt.id)
    );
    if (newIncoming.length === 0) return;
    setShownTransferIds((prev) => {
      const next = new Set(prev);
      newIncoming.forEach((pt) => next.add(pt.id));
      return next;
    });
    playTransferSound();
    if (!activeTransferPopup) {
      setActiveTransferPopup(newIncoming[0]);
      pendingQueueRef.current = newIncoming.slice(1);
    } else {
      pendingQueueRef.current.push(...newIncoming);
    }
  }, [pendingTransfers, user, shownTransferIds, activeTransferPopup]);

  // ---- Refetch laptops whenever a filter changes ---------------------------
  const refresh = useCallback(async () => {
    try {
      const params = tab === 'dashboard' ? {} : { storeId, status, search };
      setLaptops(await getLaptops(params));
    } catch (e) {
      notify(e.message, 'error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, storeId, status, search]);

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

    const onPendingTransfersChanged = () => {
      reloadPendingTransfers();
    };
    socket.on('pending_transfers:updated', onPendingTransfersChanged);

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
        const params = tab === 'dashboard' ? {} : { storeId, status, search };
        const [s, l, lg, st] = await Promise.all([
          getStores(),
          getLaptops(params),
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
        reloadPendingTransfers();
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
      socket.off('pending_transfers:updated', onPendingTransfersChanged);
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
    leavePresence();
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
      await initiateTransfer(laptopId, toStoreId);
      notify('Transfer request sent — awaiting acceptance from destination store', 'success');
      await refresh();
    } catch (e) {
      notify(e.message, 'error');
    }
  };

  const handleAcceptTransfer = async (transferId) => {
    try {
      await acceptTransfer(transferId);
      notify('Transfer accepted — laptop moved', 'success');
      await refresh();
    } catch (e) {
      notify(e.message, 'error');
    }
  };

  const handleRejectTransfer = async (transferId) => {
    try {
      await rejectTransfer(transferId);
      notify('Transfer rejected', 'success');
      await refresh();
    } catch (e) {
      notify(e.message, 'error');
    }
  };

  const handleCancelTransfer = async (transferId) => {
    try {
      await cancelTransfer(transferId);
      notify('Transfer cancelled', 'success');
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
        status: form.status || 'In Stock',
        purchase_date: form.purchase_date || form.created_at || null,
        created_at: form.purchase_date || form.created_at || null
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
      const isEdit = !!repairModal?.repair;
      const payload = {
        laptop_id: form.laptop_id ? Number(form.laptop_id) : null,
        serial_number: form.serial_number,
        brand_model: form.brand_model,
        issue: form.issue,
        vendor: form.vendor,
        cost: form.cost === '' || form.cost == null ? (isEdit ? null : 0) : Number(form.cost),
        charge: form.charge === '' || form.charge == null ? (isEdit ? null : 0) : Number(form.charge),
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
        source_type: form.source_type || 'others',
        source_id: form.source_id === '' || form.source_id == null ? null : Number(form.source_id),
        purchase_rate: form.purchase_rate === '' || form.purchase_rate == null ? 0 : Number(form.purchase_rate),
        extra_charges: form.extra_charges === '' || form.extra_charges == null ? 0 : Number(form.extra_charges),
        quantity: Number(form.quantity) || 1,
        current_store_id: form.current_store_id ? Number(form.current_store_id) : null,
        status: form.status || 'In Stock',
        comment: form.comment,
        purchaser_aadhar_hash: form.purchaser_aadhar_hash || null,
        purchaser_aadhar: form.purchaser_aadhar || null,
        purchaser_name: form.purchaser_name || null,
        purchaser_phone: form.purchaser_phone || null
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

  const handleSellConfirm = async (price, { customerId, aadharHash, aadharError, paymentMethod, paymentDetail } = {}) => {
    const l = sellTarget;
    setSellTarget(null);
    if (!l) return;
    if (aadharError) {
      notify(aadharError, 'error');
      return;
    }
    const num = Number(price);
    if (!Number.isFinite(num) || num < 0) {
      notify('Enter a valid sale price', 'error');
      return;
    }
    try {
      await sellLaptop(l.id, num, customerId, aadharHash, paymentMethod, paymentDetail);
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
  const storeCount = (id) => {    const assigned = laptops.filter((l) => l.current_store_id != null);
    return id === 'all'
      ? assigned.length
      : assigned.filter((l) => l.current_store_id === id).length;
  };

  // Merged UI labels (defaults + super-admin custom text from settings).
  const t = { ...DEFAULT_LABELS, ...(labels || {}) };

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page">
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return <Login onSuccess={(token, u) => handleAuth(token, u, null)} />;
  }

  return (
    <LabelsProvider labels={labels}>
      <div className="min-h-screen bg-page text-gray-900 overflow-x-hidden overflow-y-auto">


      <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        {tab === 'dashboard' ? (
        <DashboardTab
              laptops={laptops}
              logs={logs}
              customers={customers}
              purchases={purchases}
              repairs={repairs}
              onNavigate={setTab}
              onFocusLaptop={handleFocusLaptop}
              user={user}
              pendingTransfers={pendingTransfers}
              stores={stores}
              onTransfer={handleTransfer}
              canTransfer={canTransfer}
            />
        ) : tab === 'inventory' ? (
          <InventoryView
            laptops={laptops.filter((l) => l.current_store_id != null)}
            allLaptops={laptops}
            stores={stores}
            storeId={storeId}
            setStoreId={setStoreId}
            status={status}
            setStatus={setStatus}
            search={search}
            setSearch={setSearch}
            canEdit={canEditInventory}
            canTransfer={canTransfer}
            canSell={canEditInventory}
            sellStoreId={!isAdmin && user?.role === 'manager' ? (user?.home_store_id ?? null) : null}
            canManageCustomers={canManageCustomers}
            showSensitive={canViewPII}
            onTransfer={handleTransfer}
            onSell={handleSell}
            onEdit={(laptop) => setInvModal({ laptop })}
            onDelete={handleDelete}
          />
        ) : tab === 'purchases' ? (
          <PurchasesTab
            purchases={purchases}
            summary={purchasesSummary}
            canEditInventory={canEditInventory}
            canViewPII={canViewPII}
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
          <SalesTab stores={stores} isSuperAdmin={isSuperAdmin} isAdmin={isAdmin} canSeeCustomer={canViewPII} userRole={user?.role} homeStoreId={user?.home_store_id ?? null} onNotify={notify} />
        ) : tab === 'customers' ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">{t.custIntro || 'Manage your customers. Linked to sales when a laptop is sold to them.'}</p>
            <CustomersManager onNotify={notify} />
          </div>
) : tab === 'stats' ? (
          <Suspense fallback={<div className="py-10 text-center text-sm text-gray-500">Loading reports…</div>}>
            <ReportsTab
            stores={stores}
            logs={logs}
            laptops={laptops}
            purchases={purchases}
            isAdmin={isAdmin}
            homeStoreId={user?.home_store_id ?? null}
            onDailyViewChange={setReportsViewOpen}
            onOpenStore={(storeId, q = '') => {
              setStoreId(storeId == null || storeId === '' ? '' : String(storeId));
              setStatus('');
              setSearch(q || '');
              setTab('inventory');
            }}
          />
          </Suspense>
        ) : tab === 'vendor-laptops' ? (
          <VendorLaptopsTab
            stores={stores}
            vendors={vendors}
            brands={brands}
            isAdmin={isAdmin}
            isSuperAdmin={isSuperAdmin}
            onNotify={notify}
            onRefresh={async () => {
              const data = await getLaptops({ storeId, status, search });
              setLaptops(data);
            }}
          />
        ) : tab === 'transfers' ? (
          <TransferHistoryTab
            stores={stores}
            initialLogs={logs}
            pendingTransfers={pendingTransfers}
            userRole={user?.role}
            userHomeStoreId={user?.home_store_id}
            onAcceptTransfer={handleAcceptTransfer}
            onRejectTransfer={handleRejectTransfer}
            onCancelTransfer={handleCancelTransfer}
          />
        ) : tab === 'data-audit' ? (
          <DataAuditTab isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} />
        ) : (
          <SalesTab stores={stores} isSuperAdmin={isSuperAdmin} isAdmin={isAdmin} canSeeCustomer={canViewPII} userRole={user?.role} homeStoreId={user?.home_store_id ?? null} onNotify={notify} />
        )}
      </main>

      {invModal && (
        <InventoryModal
          stores={stores}
          brands={brands}
          vendors={vendors}
          laptops={laptops}
          productLines={[...new Set(laptops.map((l) => l.product_line).filter(Boolean))].sort()}
          editing={invModal.laptop}
          onSave={handleSave}
          onClose={() => setInvModal(null)}
        />
      )}

      {purchaseModal && (
        <PurchaseModal
          stores={stores}
          vendors={vendors}
          brands={brands}
          laptops={laptops}
          purchases={purchases}
          customers={customers}
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
          isSuperAdmin={isSuperAdmin}
        />
      )}

      {delTarget && (
        <DangerConfirmModal
          title="Delete this laptop?"
          warning={`"${delTarget.label}" will be permanently removed from inventory along with its transfer history. This cannot be undone.`}
          onConfirm={handleDeleteConfirm}
          onClose={() => setDelTarget(null)}
          isSuperAdmin={isSuperAdmin}
        />
      )}

      {repairDelTarget && (
        <DangerConfirmModal
          title="Delete this repair?"
          warning={`The repair record for "${repairDelTarget.brand_model || repairDelTarget.serial_number || '#' + repairDelTarget.id}" will be permanently removed. This cannot be undone.`}
          onConfirm={handleRepairDeleteConfirm}
          onClose={() => setRepairDelTarget(null)}
          isSuperAdmin={isSuperAdmin}
        />
      )}

      {repairModal && (
        <RepairModal
          editing={repairModal.repair}
          laptops={repairLaptopOptions}
          repairs={repairs}
          stores={stores}
          homeStoreId={user?.home_store_id ?? null}
          onSave={handleRepairSave}
          onClose={() => setRepairModal(null)}
        />
      )}

      {brandsOpen && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-gray-200 bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold tracking-tight text-gray-900">{t.brTitle || 'Manage Brands'}</h2>
              <button onClick={() => setBrandsOpen(false)} className="text-gray-500 hover:text-gray-900 transition-colors" aria-label="Close">
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
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 sm:p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] sm:max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-gray-200 bg-white p-4 sm:p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold tracking-tight text-gray-900">{t.vendManageT || 'Manage Vendors'}</h2>
              <button onClick={() => setVendorsOpen(false)} className="text-gray-500 hover:text-gray-900 transition-colors" aria-label="Close">
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
          currentUserId={user?.id ?? null}
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

      {/* Transfer approval popup */}
      {activeTransferPopup && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
          <div className="panel mx-4 w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 4v12m0 0l4-4m-4 4l-4-4" />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-900">{t.trPopT || 'Incoming Transfer Request'}</h3>
                  {pendingQueueRef.current.length > 0 && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                      +{pendingQueueRef.current.length} more
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-gray-500">{t.trPopBy || 'Requested by'} {activeTransferPopup.initiated_by}</p>
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-3 space-y-1.5">
              <p className="text-sm font-medium text-gray-900">
                {[activeTransferPopup.brand, activeTransferPopup.product_line, activeTransferPopup.brand_model].filter(Boolean).join(' ') || activeTransferPopup.brand_model || 'Laptop'}
              </p>
              <p className="text-xs text-gray-500">
                {[
                  activeTransferPopup.processor_type,
                  activeTransferPopup.ram,
                  activeTransferPopup.generation,
                  activeTransferPopup.storage_size ? `${activeTransferPopup.storage_size} ${activeTransferPopup.storage_type || ''}`.trim() : activeTransferPopup.storage_type
                ].filter(Boolean).join(' • ') || '—'}
              </p>
              <div className="flex items-center gap-2 text-xs">
                <span className="rounded-md border border-gray-200 bg-white px-1.5 py-0.5 font-medium text-gray-600">{activeTransferPopup.from_store_name}</span>
                <svg className="h-3.5 w-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
                <span className="rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 font-medium text-blue-600">{activeTransferPopup.to_store_name}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { handleAcceptTransfer(activeTransferPopup.id); const next = pendingQueueRef.current.shift(); setActiveTransferPopup(next || null); if (next) playTransferSound(); }}
                className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
              >
                {t.trAccept || 'Accept'}
              </button>
              <button
                onClick={() => { handleRejectTransfer(activeTransferPopup.id); const next = pendingQueueRef.current.shift(); setActiveTransferPopup(next || null); if (next) playTransferSound(); }}
                className="flex-1 rounded-lg bg-red-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-600 transition-colors"
              >
                {t.trReject || 'Reject'}
              </button>
            </div>
            <button
              onClick={() => { const next = pendingQueueRef.current.shift(); setActiveTransferPopup(next || null); if (next) playTransferSound(); }}
              className="w-full text-center text-[11px] text-gray-500 hover:text-gray-600 transition-colors"
            >
              {t.trDismiss || 'Dismiss (decide later)'}
            </button>
          </div>
        </div>
      )}

      {toast && <Toast key={toast.id} msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <QuickBall
        currentTab={tab}
        onNavigate={setTab}
        canManage={isAdmin || isSuperAdmin}
        isAdmin={isAdmin}
        onOpenData={() => setTab('data-audit')}
        onLogout={handleLogout}
        onOpenSettings={() => setSettingsOpen(true)}
        perms={rolePerms}
        userRole={user?.role}
      />
      </div>
    </LabelsProvider>
  );
}
