import { NAV_ITEMS } from '../App';

export default function BottomNav({ tab, onNavigate }) {
  return (
    <nav className="fixed left-0 top-14 bottom-0 z-50 w-14 border-r border-line bg-page/95 backdrop-blur-md sm:hidden overflow-y-auto">
      <div className="flex flex-col items-center py-2">
        <button
          onClick={() => onNavigate('dashboard')}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft mb-1"
          title="Dashboard"
        >
          <svg className="h-5 w-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </button>
        <div className="h-px w-8 bg-line mb-1" />
        <div className="flex flex-col items-center gap-1">
        {NAV_ITEMS.map((it) => {
          const active = tab === it.key;
          return (
            <button
              key={it.key}
              onClick={() => onNavigate(it.key)}
              aria-current={active ? 'page' : undefined}
              className={`group relative flex flex-col items-center gap-0.5 w-full py-2 text-[8px] leading-none font-medium transition-colors duration-150 ${
                active
                  ? 'text-accent'
                  : 'text-ink-faint active:text-ink-dim'
              }`}
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors duration-150 ${
                  active ? 'bg-accent-soft' : 'group-hover:bg-surface-2'
                }`}
              >
                {it.icon}
              </span>
              <span className="max-w-[44px] truncate leading-tight">{it.label}</span>
              {active && (
                <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r-full bg-accent" />
              )}
            </button>
          );
        })}
        </div>
      </div>
    </nav>
  );
}
