import type { HTMLAttributes, ReactNode } from 'react';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'golden' | 'success' | 'warning' | 'danger';
  children?: ReactNode;
}

export function Badge({ variant = 'default', className = '', children, ...props }: BadgeProps) {
  return (
    <span
      className={`boardui-badge boardui-badge-${variant} ${className}`.trim()}
      {...props}
    >
      {children}
    </span>
  );
}
