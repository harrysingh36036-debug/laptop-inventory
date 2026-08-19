import { useState, useRef, useEffect } from 'react';
import { NAV_ITEMS } from '../App';

export default function BottomNav({ tab, onNavigate, hidden }) {
  const [tooltip, setTooltip] = useState(null);
  const navRef = useRef(null);

  useEffect(() => {
    if (tooltip === null) return;
    const onDown = (e) => {
      if (navRef.current && !navRef.current.contains(e.target)) setTooltip(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [tooltip]);

  useEffect(() => {
    if (hidden) setTooltip(null);
  }, [hidden]);

  const handleNav = (idx, key) => {
    if (tooltip === idx) {
      setTooltip(null);
      onNavigate(key);
    } else {
      setTooltip(idx);
    }
  };

  if (hidden) return null;

  return (
    <nav ref={navRef} className="fixed left-0 top-14 bottom-0 z-50 w-16 border-r border-line bg-page/95 backdrop-blur-md sm:hidden overflow-y-auto">
      <div className="flex flex-col items-center py-2">
        <button
          onClick={() => { setTooltip(null); onNavigate('dashboard'); }}
          className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft mb-1"
          title="Dashboard"
        >
          <svg className="h-6 w-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </button>
        <div className="h-px w-10 bg-line mb-1" />
        <div className="flex flex-col items-center gap-0.5">
        {NAV_ITEMS.map((it, idx) => {
          const active = tab === it.key;
          const showTip = tooltip === idx;
          return (
            <button
              key={it.key}
              onClick={() => handleNav(idx, it.key)}
              aria-current={active ? 'page' : undefined}
              className={`group relative flex flex-col items-center gap-1 w-full py-2.5 text-[10px] leading-none font-bold ${
                active
                  ? 'text-accent'
                  : 'text-ink-dim'
              }`}
            >
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                  active ? 'bg-accent-soft' : 'group-hover:bg-surface-2'
                }`}
              >
                {it.icon}
              </span>
              <span className="max-w-[56px] truncate leading-tight font-semibold">{it.label}</span>
              {active && (
                <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r-full bg-accent" />
              )}

              {showTip && (
                <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink shadow-pop z-50">
                  {it.label}
                </span>
              )}
            </button>
          );
        })}
        </div>
      </div>
    </nav>
  );
}
