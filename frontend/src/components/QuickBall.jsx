import { useState, useRef, useEffect } from 'react';

export default function QuickBall({ onAddInventory, onAddVendorLaptop }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const handle = (fn) => {
    setOpen(false);
    fn();
  };

  const items = [
    { label: 'Inventory Laptop', color: 'bg-accent', icon: (
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="h-5 w-5 text-white">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ), onClick: onAddInventory },
    { label: 'Vendor Laptop', color: 'bg-purple-600', icon: (
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="h-5 w-5 text-white">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ), onClick: onAddVendorLaptop },
  ];

  return (
    <div ref={ref} className="fixed bottom-5 right-5 z-50 sm:hidden">
      {open && (
        <div className="absolute bottom-16 right-0 flex flex-col items-end gap-3">
          {items.map((it, i) => (
            <button
              key={it.label}
              onClick={() => handle(it.onClick)}
              className="flex items-center gap-2.5 rounded-full bg-white px-4 py-2.5 shadow-lg border border-line text-sm font-medium text-ink animate-[slideUp_0.2s_ease-out]"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <span>{it.label}</span>
              <span className={`flex h-8 w-8 items-center justify-center rounded-full ${it.color}`}>
                {it.icon}
              </span>
            </button>
          ))}
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex h-14 w-14 items-center justify-center rounded-full bg-accent shadow-lg shadow-accent/30 transition-transform duration-200 ${open ? 'rotate-45 scale-95' : ''}`}
      >
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" className="h-6 w-6 text-white">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </div>
  );
}