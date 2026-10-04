'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppLayout } from '@/src/components/layout/AppLayout';
import { Card } from '@/src/components/ui/Card';
import { Badge } from '@/src/components/ui/Badge';
import { Button } from '@/src/components/ui/Button';
import { useElectronInfo } from '@/src/hooks/useElectron';
import { useAuthContext } from '@/src/contexts';
import {
  Database,
  Table,
  MessageSquare,
  Code2,
  ShieldCheck,
  Cpu,
  ArrowRight,
  LogOut,
} from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();
  const { isElectron, version, platform, loading, error } = useElectronInfo();
  const { user, logout, sessionExpiresAt } = useAuthContext();

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  // Format session expiry for display
  const sessionExpiryDisplay = sessionExpiresAt
    ? new Date(sessionExpiresAt).toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : null;

  return (
    <AppLayout title="Dashboard" databaseName="chinook.db (demo)">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '1200px' }}>
        {/* Welcome Banner */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(19, 19, 26, 0.8) 100%)',
            border: '1px solid var(--color-border-strong)',
            borderRadius: 'var(--radius-xl)',
            padding: '1.75rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
              <Badge variant="accent">SQL-Sensi v0.1.0</Badge>
              <Badge variant="success">Read-Only Safety Active</Badge>
              {sessionExpiryDisplay && (
                <Badge variant="warning">Session expires {sessionExpiryDisplay}</Badge>
              )}
            </div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0.25rem 0' }}>
              {user?.email ? `Welcome, ${user.email}` : 'Welcome to SQL Sensi'}
            </h1>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', maxWidth: '600px' }}>
              Upload any SQLite database file to inspect schemas, ask natural language questions, generate safe SQL queries, and visualize results instantly.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <Link href="/database">
              <Button variant="secondary" icon={<Database size={16} />}>
                Upload Database
              </Button>
            </Link>
            <Link href="/chat">
              <Button variant="primary" icon={<MessageSquare size={16} />}>
                Start Query Chat
              </Button>
            </Link>
            <Button
              variant="outline"
              icon={<LogOut size={16} />}
              onClick={handleLogout}
            >
              Sign Out
            </Button>
          </div>
        </div>

        {/* Quick Action Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
          <Card
            title="Database Manager"
            subtitle="Connect or inspect SQLite .db files"
            headerAction={<Database size={18} style={{ color: 'var(--color-accent)' }} />}
          >
            <p style={{ fontSize: '0.825rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
              Validate SQLite headers, check integrity, and inspect physical file properties.
            </p>
            <Link href="/database">
              <Button variant="outline" size="sm" icon={<ArrowRight size={14} />}>
                Manage Database
              </Button>
            </Link>
          </Card>

          <Card
            title="Schema Explorer"
            subtitle="11 Tables, 62 Columns identified"
            headerAction={<Table size={18} style={{ color: 'var(--color-accent)' }} />}
          >
            <p style={{ fontSize: '0.825rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
              Explore tables, column data types, foreign key relationships, and indexes.
            </p>
            <Link href="/schema">
              <Button variant="outline" size="sm" icon={<ArrowRight size={14} />}>
                Explore Schema
              </Button>
            </Link>
          </Card>

          <Card
            title="Natural Language Chat"
            subtitle="Ask questions in plain English"
            headerAction={<MessageSquare size={18} style={{ color: 'var(--color-accent)' }} />}
          >
            <p style={{ fontSize: '0.825rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
              AI provider generates schema-aware, read-only SQL with ambiguity detection.
            </p>
            <Link href="/chat">
              <Button variant="outline" size="sm" icon={<ArrowRight size={14} />}>
                Open Chat
              </Button>
            </Link>
          </Card>

          <Card
            title="SQL Editor & Optimizer"
            subtitle="Review, edit & EXPLAIN plan"
            headerAction={<Code2 size={18} style={{ color: 'var(--color-accent)' }} />}
          >
            <p style={{ fontSize: '0.825rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
              Inspect EXPLAIN QUERY PLAN, detect full-table scans, and preview rewrites.
            </p>
            <Link href="/sql-editor">
              <Button variant="outline" size="sm" icon={<ArrowRight size={14} />}>
                Open SQL Editor
              </Button>
            </Link>
          </Card>
        </div>

        {/* System & Architecture Status */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <Card
            title="Electron Runtime & IPC Status"
            subtitle="Desktop process communication bridge"
            headerAction={<Cpu size={18} style={{ color: 'var(--color-accent)' }} />}
          >
            {loading ? (
              <p style={{ color: 'var(--color-text-secondary)' }}>Connecting to main process…</p>
            ) : error ? (
              <p style={{ color: 'var(--color-danger)' }}>IPC Error: {error}</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Environment:</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{isElectron ? 'Electron Desktop' : 'Web Browser Preview'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>App Version:</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-accent)' }}>{version ?? '0.1.0'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Platform:</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{platform ?? (typeof navigator !== 'undefined' ? navigator.platform : 'win32')}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>SQLite Driver:</span>
                  <Badge variant="success" size="sm">node:sqlite (Node 24 Built-in)</Badge>
                </div>
              </div>
            )}
          </Card>

          <Card
            title="Security & Governance Rules"
            subtitle="Enforced by rules.md and SQL Validator"
            headerAction={<ShieldCheck size={18} style={{ color: 'var(--color-success)' }} />}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.825rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Badge variant="success" size="sm">Active</Badge>
                <span>Read-Only Execution (SELECT only)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Badge variant="success" size="sm">Active</Badge>
                <span>Destructive SQL Blocking (INSERT, UPDATE, DROP, ALTER)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Badge variant="success" size="sm">Active</Badge>
                <span>Re-validation required after every user query edit</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Badge variant="success" size="sm">Active</Badge>
                <span>Context Isolation & Sandbox Bridge Enabled</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
