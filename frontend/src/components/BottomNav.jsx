import { useState, useRef, useEffect } from 'react';

export default function BottomNav({ tab, onNavigate, hidden, onAddInventory, onAddVendorLaptop }) {
  const [addOpen, setAddOpen] = useState(false);
  const popupRef = useRef(null);

  useEffect(() => {
    if (!addOpen) return;
    const onDown = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target)) setAddOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [addOpen]);

  useEffect(() => {
    if (hidden) setAddOpen(false);
  }, [hidden]);

  if (hidden) return null;

  const tabs = [
    { key: 'dashboard', label: 'Home', icon: (
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm9 0a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1h-5a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1v-5zm9 0a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1h-5a1 1 0 01-1-1v-5z" />
      </svg>
    )},
    { key: 'purchases', label: 'Purchase', icon: (
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h2l2.4 12.2a1 1 0 001 .8h9.2a1 1 0 001-.8L21 8H6" />
        <circle cx="9" cy="20" r="1.3" />
        <circle cx="18" cy="20" r="1.3" />
      </svg>
    )},
    { key: 'sales', label: 'Sale', icon: (
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 5h7M8 5v14M8 12h6a3 3 0 000-6H8m0 6h6a3 3 0 010 6H8" />
      </svg>
    )},
    { key: 'transfers', label: 'Transfers', icon: (
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
      </svg>
    )},
  ];

  const handleAdd = (action) => {
    setAddOpen(false);
    action();
  };

  return (
    <nav ref={popupRef} className="mobile-bottom-nav">
      <div className="nav-items">
        {tabs.slice(0, 2).map((it) => {
          const active = tab === it.key;
          return (
            <button
              key={it.key}
              onClick={() => onNavigate(it.key)}
              className={`nav-btn ${active ? 'active' : ''}`}
            >
              {it.icon}
              <span>{it.label}</span>
            </button>
          );
        })}

        <div className="relative">
          {addOpen && (
            <div className="add-popup">
              <button onClick={() => handleAdd(onAddInventory)}>
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Add Inventory Laptop
              </button>
              <button onClick={() => handleAdd(onAddVendorLaptop)}>
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V5a2 2 0 012-2h2a2 2 0 012 2v14m6-8v8m0-8v8m6-4h-8l-4-4m4 4V4" />
                </svg>
                Add Vendor Laptop
              </button>
            </div>
          )}
          <button
            onClick={() => setAddOpen((o) => !o)}
            className="nav-add-btn"
            title="Add"
          >
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        {tabs.slice(2).map((it) => {
          const active = tab === it.key;
          return (
            <button
              key={it.key}
              onClick={() => onNavigate(it.key)}
              className={`nav-btn ${active ? 'active' : ''}`}
            >
              {it.icon}
              <span>{it.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
