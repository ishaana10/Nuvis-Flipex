import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline' | 'ghost' | 'danger' | 'default';
  size?: 'sm' | 'md' | 'lg';
  children?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}: ButtonProps) {
  const base =
    variant === 'primary' || variant === 'default'
      ? 'btn-primary'
      : variant === 'outline'
        ? 'btn-secondary'
        : variant === 'danger'
          ? 'action-pill delete'
          : 'link';
  return (
    <button
      type={props.type ?? 'button'}
      className={`${base} boardui-btn-${size} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}
