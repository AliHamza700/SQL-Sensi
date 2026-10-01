'use client';

import React from 'react';
import { Database, Wifi, WifiOff } from 'lucide-react';
import { Badge } from '@/src/components/ui/Badge';
import { useElectronInfo } from '@/src/hooks/useElectron';

export interface HeaderProps {
  title?: string;
  databaseName?: string | null;
  isOnline?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  databaseName,
  isOnline = true,
}) => {
  const { isElectron, version } = useElectronInfo();

  return (
    <header
      style={{
        height: 'var(--header-height)',
        backgroundColor: 'var(--color-bg-surface)',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 1.5rem',
        position: 'sticky',
        top: 0,
        zIndex: 40,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        {title && (
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
            {title}
          </h2>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        {/* Active Database Indicator */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.25rem 0.625rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border)',
            fontSize: '0.8rem',
          }}
        >
          <Database size={14} style={{ color: databaseName ? 'var(--color-success)' : 'var(--color-text-disabled)' }} />
          <span style={{ color: databaseName ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
            {databaseName ?? 'No Database Loaded'}
          </span>
        </div>

        {/* Online / Offline status */}
        <div
          title={isOnline ? 'Online (AI features enabled)' : 'Offline (Local features only)'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            fontSize: '0.75rem',
            color: isOnline ? 'var(--color-success)' : 'var(--color-warning)',
          }}
        >
          {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
          <span>{isOnline ? 'AI Ready' : 'Local Mode'}</span>
        </div>

        {/* Electron Tag */}
        {isElectron && (
          <Badge variant="accent" size="sm">
            v{version ?? '0.1.0'}
          </Badge>
        )}
      </div>
    </header>
  );
};
