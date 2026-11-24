import type { KeyboardEvent, ReactNode } from 'react';
import StudioIcon from './StudioIcon';

/** Plain wrapping container: content flows onto extra rows instead of scrolling. */
export function ToolbarWrap({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`tw-wrap ${className}`}>{children}</div>;
}

export interface TabItem {
  id: string;
  label: string;
  icon?: string;
  count?: number | string;
  title?: string;
}

/** Accessible tab list (role=tablist). All tabs stay visible and wrap onto new rows. Arrow keys, Home and End move between tabs. */
export function TabBar({
  tabs,
  value,
  onChange,
  variant = 'pill',
  ariaLabel,
  testId,
  className = '',
}: {
  tabs: TabItem[];
  value: string;
  onChange: (id: string) => void;
  variant?: 'pill' | 'grid' | 'segment' | 'app';
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
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKey}
      className={`st-list st-${variant} ${className}`}
      data-testid={testId}
    >
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            title={t.title || t.label}
            data-testid={testId ? `${testId}-${t.id}` : undefined}
            className={`st-tab ${active ? 'active' : ''}`}
            onClick={() => onChange(t.id)}
          >
            {t.icon && <StudioIcon name={t.icon} size={variant === 'grid' ? 18 : 16} />}
            <span className="st-label">{t.label}</span>
            {t.count !== undefined && <span className="st-count">{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export default TabBar;
