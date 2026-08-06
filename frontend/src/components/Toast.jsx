import { useEffect } from 'react';

const STYLES = {
  success: 'border-emerald-500 bg-emerald-50 text-emerald-800',
  error: 'border-red-500 bg-red-50 text-red-800',
  info: 'border-slate-500 bg-white text-slate-800'
};

export default function Toast({ msg, type = 'info', onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="fixed inset-x-0 bottom-5 z-50 flex justify-center px-4 pointer-events-none">
      <div className={`pointer-events-auto max-w-md rounded-xl border px-4 py-3 shadow-lg animate-[slideup_.25s_ease-out] ${STYLES[type]}`}>
        <p className="text-sm font-medium">{msg}</p>
      </div>
    </div>
  );
}