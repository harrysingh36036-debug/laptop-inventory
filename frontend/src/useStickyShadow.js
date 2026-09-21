import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Tracks whether a horizontally-scrollable container currently has content
 * hidden beneath a sticky right-hand column.
 *
 * Usage:
 *   const { scrollRef, scrolled, onScroll } = useStickyShadow();
 *   <div ref={scrollRef} onScroll={onScroll} className="overflow-x-auto">…</div>
 *   <th className={stickyCol(scrolled, th)}>…</th>   // header cell
 *   <td className={stickyCol(scrolled, td)}>…</td>   // body cells
 *
 * `scrolled` is true while content is hidden beneath the pinned column.
 */
export default function useStickyShadow() {
  const scrollRef = useRef(null);
  const [scrolled, setScrolled] = useState(false);

  const check = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const hasOverflow = el.scrollWidth > el.clientWidth + 1;
    const hasHidden = el.scrollLeft < el.scrollWidth - el.clientWidth - 1;
    setScrolled(hasOverflow && hasHidden);
  }, []);

  useEffect(() => {
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [check]);

  return { scrollRef, scrolled, onScroll: check };
}

/**
 * Classes for a sticky right-hand table cell. Shows a soft left-edge shadow
 * only while content is hidden beneath it, fading via transition.
 */
export function stickyCol(base, scrolled, extra = '') {
  return `${base} sticky right-0 z-10 border-l bg-white text-right transition-shadow duration-200 ${
    scrolled
      ? 'border-gray-200 shadow-[-10px_0_14px_-10px_rgba(15,23,42,0.3)]'
      : 'border-gray-100'
  } ${extra}`;
}
