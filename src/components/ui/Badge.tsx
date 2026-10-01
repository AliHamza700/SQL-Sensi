'use client';

import React from 'react';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'accent';
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'md',
}) => {
  const styles: Record<string, { bg: string; text: string; border: string }> = {
    default: {
      bg: 'var(--color-bg-elevated)',
      text: 'var(--color-text-secondary)',
      border: 'var(--color-border)',
    },
    success: {
      bg: 'var(--color-success-muted)',
      text: 'var(--color-success)',
      border: 'rgba(34, 197, 94, 0.3)',
    },
    warning: {
      bg: 'var(--color-warning-muted)',
      text: 'var(--color-warning)',
      border: 'rgba(245, 158, 11, 0.3)',
    },
    danger: {
      bg: 'var(--color-danger-muted)',
      text: 'var(--color-danger)',
      border: 'rgba(239, 68, 68, 0.3)',
    },
    info: {
      bg: 'var(--color-info-muted)',
      text: 'var(--color-info)',
      border: 'rgba(56, 189, 248, 0.3)',
    },
    accent: {
      bg: 'var(--color-accent-muted)',
      text: 'var(--color-accent)',
      border: 'rgba(99, 102, 241, 0.3)',
    },
  };

  const current = styles[variant];

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        padding: size === 'sm' ? '0.125rem 0.375rem' : '0.25rem 0.625rem',
        fontSize: size === 'sm' ? '0.7rem' : '0.75rem',
        fontWeight: 600,
        borderRadius: 'var(--radius-full)',
        backgroundColor: current.bg,
        color: current.text,
        border: `1px solid ${current.border}`,
        lineHeight: 1,
      }}
    >
      {children}
    </span>
  );
};
