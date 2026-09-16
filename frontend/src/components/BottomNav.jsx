import { useState, useRef, useEffect } from 'react';

export default function BottomNav({ tab, onNavigate, hidden, onAddInventory, onAddVendorLaptop, isAdmin, onOpenData }) {
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
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    )},
    { key: 'inventory', label: 'Inventory', icon: (
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    )},
    { key: 'reports', label: 'Reports', icon: (
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    )},
    { key: 'more', label: 'More', icon: (
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
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
              {isAdmin && (
                <button onClick={() => handleAdd(onOpenData)}>
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Data Log
                </button>
              )}
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