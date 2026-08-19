import { NAV_ITEMS } from '../App';

export default function BottomNav({ tab, onNavigate }) {
  return (
    <nav className="fixed left-0 top-14 bottom-0 z-50 w-14 border-r border-line bg-page/95 backdrop-blur-md sm:hidden overflow-y-auto">
      <div className="flex flex-col items-center gap-1 py-2">
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
    </nav>
  );
}
