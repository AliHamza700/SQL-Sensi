'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Database,
  Table,
  MessageSquare,
  Code2,
  BarChart3,
  Settings,
  ShieldCheck,
  ScrollText,
  Users,
  LogOut,
} from 'lucide-react';
import { useAuthContext } from '@/src/contexts';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: string;
  /** Only shown to administrators. */
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { label: 'Home', href: '/dashboard', icon: <LayoutDashboard size={18} /> },
  { label: 'Connections', href: '/database', icon: <Database size={18} /> },
  { label: 'Ask AI', href: '/chat', icon: <MessageSquare size={18} /> },
  { label: 'SQL Editor', href: '/sql-editor', icon: <Code2 size={18} /> },
  { label: 'Schema', href: '/schema', icon: <Table size={18} /> },
  { label: 'Results & Charts', href: '/results', icon: <BarChart3 size={18} /> },
  { label: 'Users', href: '/users', icon: <Users size={18} />, adminOnly: true },
  { label: 'Audit Log', href: '/audit', icon: <ScrollText size={18} />, adminOnly: true },
  { label: 'Settings', href: '/settings', icon: <Settings size={18} /> },
];

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthContext();
  const email = user?.email ?? 'Signed out';
  const isAdmin = user?.role === 'admin';
  const visibleNav = navItems.filter((item) => !item.adminOnly || isAdmin);

  // Real sign-out: clear the session AND disconnect the active database
  // (useAuth.logout does both), then go to the login screen. Previously this was
  // a bare link to /login that left the session and connection intact.
  const handleSignOut = async () => {
    try {
      await logout();
    } finally {
      router.push('/login');
    }
  };

  return (
    <aside
      style={{
        width: 'var(--sidebar-width)',
        backgroundColor: 'var(--color-sidebar-bg)',
        color: 'var(--color-sidebar-text)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
        padding: '1.5rem 1rem',
        boxSizing: 'border-box',
        height: '100vh',
        position: 'fixed',
        left: 0,
        top: 0,
        zIndex: 50,
      }}
    >
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0 0.5rem' }}>
        <div
          aria-hidden="true"
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            backgroundColor: 'var(--brand-cream)',
            color: 'var(--brand-deep)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Database size={20} strokeWidth={2.2} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontWeight: 700, fontSize: '1.125rem', lineHeight: 1.1 }}>SQL Sensi</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-sidebar-text-muted)' }}>Version 2</span>
        </div>
      </div>

      {/* Navigation */}
      <nav aria-label="Main" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem', overflowY: 'auto' }}>
        {visibleNav.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
            >
              <span className="icon-container">{item.icon}</span>
              <span style={{ flex: 1 }}>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Safety status */}
      <div
        style={{
          padding: '0.75rem',
          backgroundColor: 'var(--color-sidebar-hover)',
          borderRadius: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.25rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: 600 }}>
          <ShieldCheck size={14} style={{ color: 'var(--brand-cream)' }} />
          <span>Read-only mode</span>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--color-sidebar-text-muted)', margin: 0, lineHeight: 1.4 }}>
          Queries can read data but never change it.
        </p>
      </div>

      {/* User */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.625rem',
          padding: '0.625rem 0.75rem',
          borderRadius: '12px',
          backgroundColor: 'var(--color-sidebar-hover)',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: '32px',
            height: '32px',
            flex: 'none',
            borderRadius: '50%',
            backgroundColor: 'var(--brand-cream)',
            color: 'var(--brand-deep)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.8rem',
            fontWeight: 700,
          }}
        >
          {email.charAt(0).toUpperCase()}
        </div>
        <span
          title={email}
          style={{ flex: 1, minWidth: 0, fontSize: '0.8rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {email}
        </span>
        <button
          type="button"
          onClick={handleSignOut}
          className="sidebar-icon-btn"
          aria-label="Sign out"
          title="Sign out"
          style={{
            color: 'var(--color-sidebar-text)',
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
};
