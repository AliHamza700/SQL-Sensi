'use client';

import React from 'react';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'outline';
  size?: 'sm' | 'md';
  style?: React.CSSProperties;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'md',
  style = {},
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
      border: 'transparent',
    },
    warning: {
      bg: 'var(--color-warning-muted)',
      text: 'var(--color-warning)',
      border: 'transparent',
    },
    danger: {
      bg: 'var(--color-danger-muted)',
      text: 'var(--color-danger)',
      border: 'transparent',
    },
    info: {
      bg: 'var(--color-info-muted)',
      text: 'var(--color-info)',
      border: 'var(--brand-sky)',
    },
    accent: {
      bg: 'var(--color-accent)',
      text: 'var(--color-on-accent)',
      border: 'transparent',
    },
    outline: {
      bg: 'transparent',
      text: 'var(--color-text-secondary)',
      border: 'var(--color-border)',
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
        ...style,
      }}
    >
      {children}
    </span>
  );
};
