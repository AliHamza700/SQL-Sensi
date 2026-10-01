'use client';

import React from 'react';
import { clsx } from 'clsx';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  icon,
  className,
  disabled,
  ...props
}) => {
  const baseStyles: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    fontWeight: 500,
    borderRadius: 'var(--radius-md)',
    cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
    opacity: disabled || isLoading ? 0.6 : 1,
    transition: 'all var(--transition-fast)',
    border: '1px solid transparent',
    fontFamily: 'var(--font-sans)',
  };

  const sizeStyles: Record<string, React.CSSProperties> = {
    sm: { padding: '0.25rem 0.625rem', fontSize: '0.75rem', height: '28px' },
    md: { padding: '0.5rem 1rem', fontSize: '0.875rem', height: '36px' },
    lg: { padding: '0.625rem 1.25rem', fontSize: '1rem', height: '44px' },
  };

  const variantStyles: Record<string, React.CSSProperties> = {
    primary: {
      backgroundColor: 'var(--color-accent)',
      color: '#ffffff',
      boxShadow: 'var(--shadow-sm)',
    },
    secondary: {
      backgroundColor: 'var(--color-bg-elevated)',
      color: 'var(--color-text-primary)',
      borderColor: 'var(--color-border)',
    },
    outline: {
      backgroundColor: 'transparent',
      color: 'var(--color-text-primary)',
      borderColor: 'var(--color-border-strong)',
    },
    danger: {
      backgroundColor: 'var(--color-danger)',
      color: '#ffffff',
    },
    ghost: {
      backgroundColor: 'transparent',
      color: 'var(--color-text-secondary)',
    },
  };

  return (
    <button
      style={{
        ...baseStyles,
        ...sizeStyles[size],
        ...variantStyles[variant],
      }}
      disabled={disabled || isLoading}
      className={clsx('btn', className)}
      {...props}
    >
      {isLoading ? (
        <span
          className="animate-spin"
          style={{
            display: 'inline-block',
            width: '14px',
            height: '14px',
            border: '2px solid currentColor',
            borderRightColor: 'transparent',
            borderRadius: '50%',
          }}
        />
      ) : icon ? (
        <span style={{ display: 'inline-flex' }}>{icon}</span>
      ) : null}
      {children}
    </button>
  );
};
