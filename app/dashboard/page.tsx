'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppLayout } from '@/src/components/layout/AppLayout';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { useElectronInfo } from '@/src/hooks/useElectron';
import { useAuthContext, useDatabaseContext } from '@/src/contexts';
import { readSession } from '@/src/utils/session-storage';
import type { Conversation, DatabaseEngine } from '@/src/types';
import { ArrowRight, Cpu, LogOut, Plus, ShieldCheck } from 'lucide-react';

const ENGINE_CHIPS: Record<DatabaseEngine, { label: string; bg: string }> = {
  sqlite: { label: 'SQLITE', bg: 'var(--brand-deep)' },
  mysql: { label: 'MYSQL', bg: 'var(--brand-mid)' },
  postgresql: { label: 'POSTGRES', bg: 'var(--brand-ink)' },
};

const SUGGESTIONS = ['Which tables are in this database?', 'Explain how the tables are related', 'What is an index?'];

function EngineChip({ engine }: { engine: DatabaseEngine }) {
  const chip = ENGINE_CHIPS[engine];
  return (
    <span
      style={{
        flex: 'none',
        padding: '0.2rem 0.5rem',
        borderRadius: '6px',
        backgroundColor: chip.bg,
        color: 'var(--color-on-accent)',
        fontSize: '0.68rem',
        fontWeight: 700,
        letterSpacing: '0.04em',
      }}
    >
      {chip.label}
    </span>
  );
}

function StatTile({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div
      style={{
        padding: '0.875rem',
        borderRadius: '12px',
        backgroundColor: 'var(--color-bg-page)',
        border: '1px solid var(--brand-cream)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.125rem',
      }}
    >
      <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--brand-deep)', lineHeight: 1.2 }}>{value}</span>
      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{label}</span>
    </div>
  );
}

const cardHeaderLink: React.CSSProperties = { fontSize: '0.8rem', fontWeight: 600 };

export default function DashboardPage() {
  const router = useRouter();
  const { isElectron, version, platform, loading, error } = useElectronInfo();
  const { user, logout, sessionExpiresAt } = useAuthContext();
  const { activeConnection, profiles } = useDatabaseContext();
  const [isMounted, setIsMounted] = React.useState(false);
  const [question, setQuestion] = React.useState('');
  const [schemaStats, setSchemaStats] = React.useState<{ tables: number; relationships: number; names: string[] } | null>(null);
  const [conversations, setConversations] = React.useState<Conversation[]>([]);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  // Schema summary for the active connection (dropped and reloaded on switch)
  React.useEffect(() => {
    setSchemaStats(null);
    const api = window.electronAPI;
    if (!api || !activeConnection) return;
    let cancelled = false;
    api.schema.extract(activeConnection.connectionId).then((res) => {
      if (cancelled || !res.success) return;
      setSchemaStats({
        tables: res.data.tables.length,
        relationships: res.data.relationships.length,
        names: res.data.tables.slice(0, 6).map((t) => t.name),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [activeConnection]);

  React.useEffect(() => {
    const token = readSession()?.token;
    if (!token) return;
    window.electronAPI?.history.list(token).then((res) => {
      if (res.success) setConversations(res.data.slice(0, 4));
    });
  }, []);

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const askQuestion = (text: string) => {
    const q = text.trim();
    if (!q) return;
    router.push(`/chat?q=${encodeURIComponent(q)}`);
  };

  const sessionExpiryDisplay = sessionExpiresAt
    ? new Date(sessionExpiresAt).toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : null;

  return (
    <AppLayout title="Home">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem', maxWidth: '1180px' }}>
        {/* Ask box */}
        <section
          style={{
            backgroundColor: 'var(--brand-deep)',
            color: 'var(--color-on-accent)',
            borderRadius: '20px',
            padding: '2rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            <h1 style={{ margin: 0, fontSize: '1.875rem', lineHeight: 1.2, fontWeight: 700 }}>
              {user?.email ? 'Ask your database anything' : 'Welcome to SQL Sensi'}
            </h1>
            <p style={{ margin: 0, fontSize: '0.95rem', lineHeight: 1.5, color: 'var(--brand-cream)', maxWidth: '640px' }}>
              {activeConnection ? (
                <>
                  Answers come from the schema of{' '}
                  <strong style={{ color: 'var(--color-on-accent)' }}>{activeConnection.label}</strong>. Queries are always read-only.
                </>
              ) : (
                'Connect a SQLite file or a MySQL / PostgreSQL server to start asking questions.'
              )}
            </p>
          </div>

          {activeConnection ? (
            <>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  askQuestion(question);
                }}
                style={{ display: 'flex', flexWrap: 'wrap', gap: '0.625rem' }}
              >
                <label htmlFor="home-ask" className="visually-hidden">Your question</label>
                <input
                  id="home-ask"
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="e.g. Which 5 customers spent the most last month?"
                  style={{
                    flex: '1 1 320px',
                    minWidth: 0,
                    minHeight: '52px',
                    padding: '0 1.125rem',
                    borderRadius: '14px',
                    border: '2px solid var(--brand-sky)',
                    backgroundColor: 'var(--color-bg-surface)',
                    color: 'var(--color-text-primary)',
                    fontFamily: 'inherit',
                    fontSize: '0.95rem',
                  }}
                />
                <button
                  type="submit"
                  className="solid-hover"
                  style={{
                    minHeight: '52px',
                    padding: '0 1.5rem',
                    border: 'none',
                    borderRadius: '14px',
                    backgroundColor: 'var(--brand-cream)',
                    color: 'var(--brand-ink)',
                    fontFamily: 'inherit',
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  Ask <ArrowRight size={18} aria-hidden="true" />
                </button>
              </form>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--brand-cream)' }}>Try:</span>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => askQuestion(s)}
                    className="on-dark-chip"
                    style={{
                      minHeight: '36px',
                      padding: '0 0.875rem',
                      borderRadius: 'var(--radius-full)',
                      border: '1px solid var(--brand-sky)',
                      backgroundColor: 'transparent',
                      color: 'var(--color-on-accent)',
                      fontFamily: 'inherit',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <Link
              href="/database"
              className="solid-hover"
              style={{
                alignSelf: 'flex-start',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                minHeight: '48px',
                padding: '0 1.25rem',
                borderRadius: '14px',
                backgroundColor: 'var(--brand-cream)',
                color: 'var(--brand-ink)',
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              Connect a database <ArrowRight size={18} aria-hidden="true" />
            </Link>
          )}
        </section>

        {/* Cards row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
          <Card
            title="Connections"
            headerAction={
              <Link href="/database" style={cardHeaderLink}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                  <Plus size={14} aria-hidden="true" /> Add
                </span>
              </Link>
            }
          >
            {profiles.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>No saved connections yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {profiles.slice(0, 3).map((p) => {
                  const isActive = p.id === activeConnection?.connectionId;
                  return (
                    <Link
                      key={p.id}
                      href="/database"
                      className="hover-row"
                      title={isActive ? 'Active connection' : 'Open in Connections to switch'}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '0.75rem',
                        borderRadius: '12px',
                        border: `1px solid ${isActive ? 'var(--brand-sky)' : 'var(--color-border)'}`,
                        backgroundColor: isActive ? 'var(--color-bg-overlay)' : 'transparent',
                        color: 'var(--color-text-primary)',
                        textDecoration: 'none',
                      }}
                    >
                      <EngineChip engine={p.engine} />
                      <span style={{ flex: 1, minWidth: 0, fontSize: '0.875rem', fontWeight: isActive ? 600 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.label}
                      </span>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: isActive ? 'var(--color-success)' : 'var(--color-text-secondary)' }}>
                        {isActive ? 'Active' : 'Saved'}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
            <p style={{ marginTop: '0.875rem', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
              One connection is active at a time.
            </p>
          </Card>

          <Card
            title="Schema at a glance"
            headerAction={<Link href="/schema" style={cardHeaderLink}>Open explorer</Link>}
          >
            {!activeConnection ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Connect a database to see its tables.</p>
            ) : !schemaStats ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Reading schema…</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.625rem' }}>
                  <StatTile value={schemaStats.tables} label="Tables" />
                  <StatTile value={schemaStats.relationships} label="Relationships" />
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                  {schemaStats.names.map((name) => (
                    <span
                      key={name}
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.75rem',
                        padding: '0.25rem 0.625rem',
                        borderRadius: '8px',
                        backgroundColor: 'var(--color-bg-overlay)',
                        color: 'var(--brand-deep)',
                      }}
                    >
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <section
            style={{
              backgroundColor: 'var(--brand-cream)',
              borderRadius: 'var(--radius-xl)',
              padding: '1.375rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.875rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
              <ShieldCheck size={22} style={{ color: 'var(--brand-deep)' }} aria-hidden="true" />
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Safety</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}><span>Queries</span><strong>Read-only</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}><span>Data changes</span><strong>Off</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}><span>Stale queries after a switch</span><strong>Refused</strong></div>
            </div>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-warning)' }}>
              Administrator settings for data changes arrive in a later version.
            </p>
          </section>
        </div>

        {/* Recent conversations */}
        <Card title="Recent conversations" headerAction={<Link href="/chat" style={cardHeaderLink}>View all</Link>}>
          {conversations.length === 0 ? (
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>No conversations yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {conversations.map((c, i) => (
                <Link
                  key={c.id}
                  href="/chat"
                  className="hover-row"
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.875rem 0.75rem',
                    borderRadius: '10px',
                    borderBottom: i < conversations.length - 1 ? '1px solid var(--color-border)' : 'none',
                    textDecoration: 'none',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  <span style={{ flex: '1 1 260px', fontSize: '0.875rem', fontWeight: 500 }}>{c.title}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                    {new Date(c.updatedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Card>

        {/* System & session (Version 1 details) */}
        <Card title="System & session" headerAction={<Cpu size={18} style={{ color: 'var(--brand-deep)' }} aria-hidden="true" />}>
          {loading ? (
            <p style={{ color: 'var(--color-text-secondary)' }}>Connecting to main process…</p>
          ) : error ? (
            <p style={{ color: 'var(--color-danger)' }}>IPC Error: {error}</p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem 2rem', fontSize: '0.85rem', flex: '1 1 480px' }}>
                <div>
                  <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Signed in as</span>
                  <span style={{ fontWeight: 600 }}>{user?.email ?? '—'}</span>
                </div>
                <div>
                  <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Session expires</span>
                  <span style={{ fontWeight: 600 }}>{sessionExpiryDisplay ?? '—'}</span>
                </div>
                <div>
                  <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Environment</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>
                    {isMounted && isElectron ? 'Electron desktop' : 'Web browser preview'} · v{version ?? '0.1.0'}
                  </span>
                </div>
                <div>
                  <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Platform</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{isMounted ? platform ?? '—' : '—'}</span>
                </div>
              </div>
              <Button variant="outline" icon={<LogOut size={16} />} onClick={handleLogout}>
                Sign out
              </Button>
            </div>
          )}
        </Card>
      </div>
    </AppLayout>
  );
}
