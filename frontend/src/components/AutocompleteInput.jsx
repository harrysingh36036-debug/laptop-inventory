import { useEffect, useMemo, useRef, useState } from 'react';

const FREQ_KEY = 'laptop-inv.autocomplete-freq';

function loadFreq() {
  try {
    return JSON.parse(localStorage.getItem(FREQ_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveFreq(map) {
  try {
    localStorage.setItem(FREQ_KEY, JSON.stringify(map));
  } catch { /* storage unavailable */ }
}

/** Increment the pick count for a field/value pair. */
function recordPick(fieldId, value) {
  if (!fieldId || !value) return;
  const map = loadFreq();
  map[fieldId] = map[fieldId] || {};
  map[fieldId][value] = (map[fieldId][value] || 0) + 1;
  saveFreq(map);
}

/**
 * Text-predicting input with a suggestion dropdown.
 * Free-form: any typed value is accepted; suggestions filter as you type
 * (prefix matches ranked first, then substring matches). Keyboard support:
 * ArrowUp/ArrowDown to move, Enter to pick, Escape to dismiss.
 */
export default function AutocompleteInput({
  value,
  onChange,
  suggestions = [],
  placeholder,
  className = '',
  id,
  autoFocus,
  emptyText = 'No matching suggestions — new value will be used',
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef(null);
  const listRef = useRef(null);

  const matches = useMemo(() => {
    const freq = loadFreq()[id] || {};
    const count = (s) => freq[s] || 0;
    const q = String(value || '').trim().toLowerCase();
    if (!q) return [...suggestions].sort((a, b) => count(b) - count(a)).slice(0, 8);
    const prefix = [];
    const includes = [];
    for (const s of suggestions) {
      const l = String(s).toLowerCase();
      if (l.startsWith(q)) prefix.push(s);
      else if (l.includes(q)) includes.push(s);
    }
    // Frequently picked values rise to the top within each match tier.
    prefix.sort((a, b) => count(b) - count(a));
    includes.sort((a, b) => count(b) - count(a));
    return [...prefix, ...includes].slice(0, 8);
  }, [value, suggestions, id]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => setActive(-1), [value]);

  const pick = (v) => {
    recordPick(id, v);
    onChange({ target: { value: v } });
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, -1));
    } else if (e.key === 'Enter') {
      if (active >= 0 && matches[active] != null) {
        e.preventDefault();
        pick(matches[active]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  // Keep the highlighted option in view.
  useEffect(() => {
    const el = listRef.current?.children[active];
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const showList = open && matches.length > 0;

  return (
    <div ref={wrapRef} className="relative">
      <input
        value={value}
        onChange={(e) => {
          onChange(e);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-autocomplete="list"
        aria-controls={id ? `${id}-listbox` : undefined}
        id={id}
        className={className}
        autoFocus={autoFocus}
      />
      {showList && (
        <ul
          ref={listRef}
          id={id ? `${id}-listbox` : undefined}
          role="listbox"
          className="absolute z-30 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          {matches.map((m, i) => (
            <li key={m}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(m)}
                onMouseEnter={() => setActive(i)}
                className={`block w-full px-3 py-1.5 text-left text-sm ${
                  i === active ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                }`}
              >
                {m}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && matches.length === 0 && String(value).trim() !== '' && (
        <p className="absolute z-30 mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[11px] text-gray-500 shadow-lg">
          {emptyText}
        </p>
      )}
    </div>
  );
}
