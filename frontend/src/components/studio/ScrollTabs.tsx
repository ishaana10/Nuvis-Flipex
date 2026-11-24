import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import StudioIcon from './StudioIcon';

/**
 * ScrollStrip: horizontal scroller for long tab rows / toolbars.
 * - arrow buttons + edge fades appear only when there is more to see
 * - mouse wheel and click-drag scroll sideways, touch uses native swipe
 * - the active item is kept in view
 * No dependencies.
 */
export function ScrollStrip({
  children,
  className = '',
  trackClassName = '',
  trackStyle,
  activeKey,
  ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  trackClassName?: string;
  trackStyle?: CSSProperties;
  activeKey?: string | number | null;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ left: false, right: false });
  const drag = useRef({ down: false, x: 0, sl: 0, moved: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollLeft > 2;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setEdge((p) => (p.left === left && p.right === right ? p : { left, right }));
  }, []);

  useLayoutEffect(() => {
    measure();
    const el = ref.current;
    if (!el) return;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    Array.from(el.children).forEach((c) => ro?.observe(c as Element));
    window.addEventListener('resize', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure, children]);

  // keep the active tab visible
  useEffect(() => {
    const el = ref.current;
    if (!el || activeKey == null) return;
    const a = el.querySelector<HTMLElement>('[aria-selected="true"], [data-active="true"], .active');
    if (!a) return;
    const target = a.offsetLeft - (el.clientWidth - a.offsetWidth) / 2;
    el.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  }, [activeKey]);

  // wheel -> horizontal (only while there is room to move that way)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) >= Math.abs(e.deltaY) || el.scrollWidth <= el.clientWidth) return;
      const max = el.scrollWidth - el.clientWidth;
      if ((e.deltaY < 0 && el.scrollLeft <= 0) || (e.deltaY > 0 && el.scrollLeft >= max)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const page = (dir: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(120, el.clientWidth * 0.7), behavior: 'smooth' });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || !ref.current) return;
    drag.current = { down: true, x: e.clientX, sl: ref.current.scrollLeft, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.down || !ref.current) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 5) d.moved = true;
    if (d.moved) ref.current.scrollLeft = d.sl - dx;
  };
  const endDrag = () => {
    drag.current.down = false;
  };
  const onClickCapture = (e: React.MouseEvent) => {
    if (drag.current.moved) {
      e.stopPropagation();
      e.preventDefault();
      drag.current.moved = false;
    }
  };

  return (
    <div className={`ss-wrap ${edge.left ? 'has-left' : ''} ${edge.right ? 'has-right' : ''} ${className}`}>
      {edge.left && (
        <button type="button" className="ss-arrow ss-arrow-l" onClick={() => page(-1)} aria-label="Scroll left" tabIndex={-1}>
          <StudioIcon name="chevL" size={14} stroke={2.4} />
        </button>
      )}
      <div
        ref={ref}
        className={`ss-track ${trackClassName}`}
        style={trackStyle}
        onScroll={measure}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onClickCapture={onClickCapture}
        aria-label={ariaLabel}
      >
        {children}
      </div>
      {edge.right && (
        <button type="button" className="ss-arrow ss-arrow-r" onClick={() => page(1)} aria-label="Scroll right" tabIndex={-1}>
          <StudioIcon name="chevR" size={14} stroke={2.4} />
        </button>
      )}
    </div>
  );
}

export interface ScrollTab {
  id: string;
  label: string;
  icon?: string;
  count?: number | string;
  title?: string;
}

/** Accessible tab list (role=tablist) built on ScrollStrip. Arrow keys, Home and End move between tabs. */
export function ScrollTabs({
  tabs,
  value,
  onChange,
  variant = 'pill',
  ariaLabel,
  testId,
  className = '',
}: {
  tabs: ScrollTab[];
  value: string;
  onChange: (id: string) => void;
  variant?: 'pill' | 'compact' | 'iconic' | 'segment';
  ariaLabel: string;
  testId?: string;
  className?: string;
}) {
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = tabs.findIndex((t) => t.id === value);
    let n = -1;
    if (e.key === 'ArrowRight') n = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = tabs.length - 1;
    if (n < 0) return;
    e.preventDefault();
    const list = e.currentTarget;
    onChange(tabs[n].id);
    requestAnimationFrame(() => {
      (list.querySelectorAll('[role="tab"]')[n] as HTMLElement | undefined)?.focus();
    });
  };

  return (
    <ScrollStrip className={`st-${variant} ${className}`} activeKey={value}>
      <div role="tablist" aria-label={ariaLabel} onKeyDown={onKey} className="st-list" data-testid={testId}>
        {tabs.map((t) => {
          const active = t.id === value;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`${testId || 'st'}-${t.id}`}
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              title={t.title || t.label}
              data-testid={testId ? `${testId}-${t.id}` : undefined}
              className={`st-tab ${active ? 'active' : ''}`}
              onClick={() => onChange(t.id)}
            >
              {t.icon && <StudioIcon name={t.icon} size={variant === 'compact' ? 14 : variant === 'iconic' ? 17 : 16} />}
              <span className="st-label">{t.label}</span>
              {t.count !== undefined && <span className="st-count">{t.count}</span>}
            </button>
          );
        })}
      </div>
    </ScrollStrip>
  );
}

export default ScrollTabs;
