import { useEffect } from 'react';

const STYLES = {
  success: {
    wrap: 'border-stock-ok/30 bg-surface text-stock-ok',
    dot: 'bg-stock-ok'
  },
  error: {
    wrap: 'border-stock-risk/30 bg-surface text-stock-risk',
    dot: 'bg-stock-risk'
  },
  info: {
    wrap: 'border-line bg-surface text-ink-dim',
    dot: 'bg-accent'
  }
};

export default function Toast({ msg, type = 'info', onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);

  const s = STYLES[type] || STYLES.info;

  return (
    <div className="fixed inset-x-0 bottom-5 z-50 flex justify-center px-4 pointer-events-none">
      <div className={`pointer-events-auto flex max-w-md items-center gap-2.5 rounded-xl border px-4 py-3 shadow-pop ${s.wrap}`}>
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`} />
        <p className="text-sm font-medium">{msg}</p>
      </div>
    </div>
  );
}