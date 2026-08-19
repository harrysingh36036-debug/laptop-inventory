import { NAV_ITEMS } from '../App';

export default function BottomNav({ tab, onNavigate }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-line bg-page/95 backdrop-blur-md sm:hidden">
      <div className="mx-auto flex max-w-[1440px] items-center justify-around px-1 py-1.5">
        {NAV_ITEMS.map((it) => {
          const active = tab === it.key;
          return (
            <button
              key={it.key}
              onClick={() => onNavigate(it.key)}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center gap-0.5 rounded-xl px-2.5 py-1.5 text-[10px] font-medium transition-colors duration-150 ${
                active
                  ? 'text-accent'
                  : 'text-ink-faint active:text-ink-dim'
              }`}
            >
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors duration-150 ${
                  active ? 'bg-accent-soft' : ''
                }`}
              >
                {it.icon}
              </span>
              <span className="leading-none">{it.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
