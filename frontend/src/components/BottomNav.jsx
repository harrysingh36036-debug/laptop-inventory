import { NAV_ITEMS } from '../App';

export default function BottomNav({ tab, onNavigate }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-line bg-page/95 backdrop-blur-md sm:hidden">
      <div className="mx-auto grid max-w-[1440px] grid-cols-8">
        {NAV_ITEMS.map((it) => {
          const active = tab === it.key;
          return (
            <button
              key={it.key}
              onClick={() => onNavigate(it.key)}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center gap-0.5 py-2 text-[9px] leading-none font-medium transition-colors duration-150 ${
                active
                  ? 'text-accent'
                  : 'text-ink-faint active:text-ink-dim'
              }`}
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-lg transition-colors duration-150 ${
                  active ? 'bg-accent-soft' : ''
                }`}
              >
                <span className="scale-90">{it.icon}</span>
              </span>
              <span className="max-w-[40px] truncate hidden min-[340px]:block">{it.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
