'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Database,
  Table,
  MessageSquare,
  Code2,
  BarChart3,
  Settings,
  ShieldCheck,
  LogOut,
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: string;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard size={18} /> },
  { label: 'Database', href: '/database', icon: <Database size={18} /> },
  { label: 'Schema Explorer', href: '/schema', icon: <Table size={18} /> },
  { label: 'AI Chat', href: '/chat', icon: <MessageSquare size={18} /> },
  { label: 'SQL Editor', href: '/sql-editor', icon: <Code2 size={18} /> },
  { label: 'Results & Charts', href: '/results', icon: <BarChart3 size={18} /> },
  { label: 'Settings', href: '/settings', icon: <Settings size={18} /> },
];

export const Sidebar: React.FC = () => {
  const pathname = usePathname();

  return (
    <aside
      style={{
        width: 'var(--sidebar-width)',
        backgroundColor: 'var(--color-bg-surface)',
        borderRight: '1px solid var(--color-border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'fixed',
        left: 0,
        top: 0,
        zIndex: 50,
      }}
    >
      {/* Brand header */}
      <div
        style={{
          padding: '1.25rem 1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <div
          style={{
            width: '34px',
            height: '34px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-accent-muted)',
            border: '1px solid var(--color-accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-accent)',
            fontSize: '1.1rem',
          }}
        >
          🗄️
        </div>
        <div>
          <span style={{ fontWeight: 700, fontSize: '0.95rem', letterSpacing: '-0.02em', display: 'block' }}>
            SQL Sensi
          </span>
          <span style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', display: 'block' }}>
            AI Database Assistant
          </span>
        </div>
      </div>

      {/* Navigation items */}
      <nav
        style={{
          flex: 1,
          padding: '0.75rem 0.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.25rem',
          overflowY: 'auto',
        }}
      >
        <div
          style={{
            fontSize: '0.68rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            color: 'var(--color-text-disabled)',
            padding: '0.5rem 0.75rem 0.25rem',
            letterSpacing: '0.05em',
          }}
        >
          Workspace
        </div>

        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.85rem',
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                backgroundColor: isActive ? 'var(--color-bg-elevated)' : 'transparent',
                border: isActive ? '1px solid var(--color-border-strong)' : '1px solid transparent',
                transition: 'all var(--transition-fast)',
              }}
            >
              <span
                style={{
                  color: isActive ? 'var(--color-accent)' : 'inherit',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {item.icon}
              </span>
              <span style={{ flex: 1 }}>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Security indicator badge */}
      <div
        style={{
          margin: '0.75rem',
          padding: '0.75rem',
          backgroundColor: 'var(--color-bg-elevated)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.35rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--color-success)', fontSize: '0.75rem', fontWeight: 600 }}>
          <ShieldCheck size={14} />
          <span>Read-Only Mode</span>
        </div>
        <p style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', margin: 0 }}>
          Destructive statements (DROP, INSERT, etc.) are strictly blocked.
        </p>
      </div>

      {/* Footer / User Session */}
      <div
        style={{
          padding: '0.75rem',
          borderTop: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div
            style={{
              width: '26px',
              height: '26px',
              borderRadius: 'var(--radius-full)',
              backgroundColor: 'var(--color-accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#fff',
            }}
          >
            U
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
            user@local
          </span>
        </div>
        <Link
          href="/login"
          title="Sign out"
          style={{
            color: 'var(--color-text-secondary)',
            display: 'flex',
            alignItems: 'center',
            padding: '0.25rem',
          }}
        >
          <LogOut size={16} />
        </Link>
      </div>
    </aside>
  );
};
