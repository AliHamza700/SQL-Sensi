'use client';

import React from 'react';
import Link from 'next/link';
import { Lock, Wifi, WifiOff } from 'lucide-react';
import { useElectronInfo } from '@/src/hooks/useElectron';
import { useDatabaseContext } from '@/src/contexts';
import type { DatabaseEngine } from '@/src/types';

const ENGINE_LABELS: Record<DatabaseEngine, string> = {
  sqlite: 'SQLITE',
  mysql: 'MYSQL',
  postgresql: 'POSTGRES',
};

/** Engine chip colours follow the approved design (mid blue for MySQL, ink for PostgreSQL) */
const ENGINE_CHIP: Record<DatabaseEngine, string> = {
  sqlite: 'var(--brand-deep)',
  mysql: 'var(--brand-mid)',
  postgresql: 'var(--brand-ink)',
};

const chip: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.375rem',
  padding: '0.375rem 0.75rem',
  borderRadius: 'var(--radius-full)',
  fontSize: '0.8rem',
  fontWeight: 600,
  whiteSpace: 'nowrap',
};

export interface HeaderProps {
  title?: string;
  /** @deprecated The header now shows the active connection from DatabaseContext */
  databaseName?: string | null;
  isOnline?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  isOnline = true,
}) => {
  const { isElectron, version } = useElectronInfo();
  // Always show what the main process actually has open, not what a page assumes
  const { activeConnection } = useDatabaseContext();

  return (
    <header
      style={{
        minHeight: 'var(--header-height)',
        backgroundColor: 'var(--color-bg-surface)',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.75rem',
        padding: '0.625rem 2rem',
        position: 'sticky',
        top: 0,
        zIndex: 40,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: 0 }}>
        {title && (
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
            {title}
          </h2>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.625rem' }}>
        {/* Active connection */}
        <Link
          href="/database"
          className="header-pill"
          title="Manage connections"
          style={{
            ...chip,
            gap: '0.5rem',
            border: '1px solid var(--brand-mid)',
            backgroundColor: 'var(--color-bg-overlay)',
            color: 'var(--color-text-primary)',
            textDecoration: 'none',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: activeConnection ? 'var(--color-success)' : 'var(--color-text-disabled)',
            }}
          />
          {activeConnection ? (
            <>
              <span
                style={{
                  padding: '0.125rem 0.5rem',
                  borderRadius: '6px',
                  backgroundColor: ENGINE_CHIP[activeConnection.engine],
                  color: 'var(--color-on-accent)',
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                }}
              >
                {ENGINE_LABELS[activeConnection.engine]}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{activeConnection.label}</span>
            </>
          ) : (
            <span style={{ color: 'var(--color-text-secondary)' }}>No database connected</span>
          )}
        </Link>

        {/* Safety */}
        <span style={{ ...chip, backgroundColor: 'var(--brand-cream)', color: 'var(--color-warning)' }}>
          <Lock size={13} strokeWidth={2.4} aria-hidden="true" />
          Read-only
        </span>

        {/* AI status */}
        <span
          title={isOnline ? 'Online (AI features enabled)' : 'Offline (local features only)'}
          style={{ ...chip, backgroundColor: 'var(--color-bg-overlay)', color: 'var(--brand-deep)' }}
        >
          {isOnline ? <Wifi size={13} aria-hidden="true" /> : <WifiOff size={13} aria-hidden="true" />}
          {isOnline ? 'AI ready · Groq' : 'Local mode'}
        </span>

        {isElectron && (
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
            v{version ?? '0.1.0'}
          </span>
        )}
      </div>
    </header>
  );
};
