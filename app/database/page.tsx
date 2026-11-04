'use client';

import React from 'react';
import { AppLayout } from '@/src/components/layout/AppLayout';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Badge';
import { useDatabaseContext } from '@/src/contexts';
import { useFileDialog } from '@/src/hooks/useElectron';
import type {
  ConnectionProfile,
  ConnectionProfileInput,
  DatabaseEngine,
  DatabaseValidationResult,
} from '@/src/types';
import {
  UploadCloud,
  FolderOpen,
  Plug,
  Unplug,
  Trash2,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Info,
} from 'lucide-react';

const ENGINE_LABELS: Record<DatabaseEngine, string> = {
  sqlite: 'SQLite',
  mysql: 'MySQL',
  postgresql: 'PostgreSQL',
};

const DEFAULT_PORTS = { mysql: 3306, postgresql: 5432 } as const;

type ServerEngine = keyof typeof DEFAULT_PORTS;

interface ServerForm {
  label: string;
  host: string;
  port: string;
  database: string;
  user: string;
  password: string;
  tls: boolean;
  savePassword: boolean;
}

type Notice = { kind: 'success' | 'error' | 'info'; text: string } | null;

const emptyServerForm = (engine: ServerEngine): ServerForm => ({
  label: '',
  host: 'localhost',
  port: String(DEFAULT_PORTS[engine]),
  database: '',
  user: '',
  password: '',
  // Off by default: local MySQL/PostgreSQL usually present a self-signed
  // certificate that strict verification rejects. Turn on for a remote server
  // whose CA you trust. (rules.md §3 — TLS is an explicit opt-in here.)
  tls: false,
  savePassword: true,
});

const inputStyle: React.CSSProperties = {
  height: '38px',
  padding: '0 0.75rem',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border-strong)',
  backgroundColor: 'var(--color-bg-elevated)',
  color: 'var(--color-text-primary)',
  fontFamily: 'var(--font-sans)',
  fontSize: '0.875rem',
  width: '100%',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  fontWeight: 600,
  color: 'var(--color-text-secondary)',
};

function describeProfile(p: ConnectionProfile): string {
  if (p.engine === 'sqlite') return p.filePath ?? '';
  return `${p.user}@${p.host}:${p.port}/${p.database}${p.tls?.enabled ? ' · TLS' : ''}`;
}

function NoticeBanner({ notice }: { notice: Notice }) {
  if (!notice) return null;
  const colors = {
    success: { bg: 'var(--color-success-muted)', fg: 'var(--color-success)', icon: <CheckCircle2 size={16} /> },
    error: { bg: 'var(--color-danger-muted)', fg: 'var(--color-danger)', icon: <AlertTriangle size={16} /> },
    info: { bg: 'var(--color-info-muted)', fg: 'var(--color-info)', icon: <Info size={16} /> },
  }[notice.kind];
  return (
    <div
      role={notice.kind === 'error' ? 'alert' : 'status'}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.5rem',
        padding: '0.75rem 1rem',
        borderRadius: 'var(--radius-md)',
        backgroundColor: colors.bg,
        color: colors.fg,
        fontSize: '0.85rem',
      }}
    >
      <span style={{ flex: 'none', marginTop: '1px' }}>{colors.icon}</span>
      <span style={{ color: 'var(--color-text-primary)' }}>{notice.text}</span>
    </div>
  );
}

export default function DatabasePage() {
  const {
    activeConnection,
    profiles,
    canSavePasswords,
    connectFile,
    connectProfile,
    disconnect,
    saveProfile,
    deleteProfile,
    testConnection,
  } = useDatabaseContext();

  const { openDialog, available } = useFileDialog({
    filters: [{ name: 'SQLite Database', extensions: ['db', 'sqlite', 'sqlite3'] }],
  });

  const [engine, setEngine] = React.useState<DatabaseEngine>('sqlite');
  const [form, setForm] = React.useState<ServerForm>(emptyServerForm('postgresql'));
  const [busy, setBusy] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<Notice>(null);
  const [fileInfo, setFileInfo] = React.useState<DatabaseValidationResult | null>(null);
  /** Saved server connection waiting for a typed password */
  const [passwordPrompt, setPasswordPrompt] = React.useState<{ profileId: string; password: string } | null>(null);

  const activeProfile = profiles.find(p => p.id === activeConnection?.connectionId);

  const update = (patch: Partial<ServerForm>) => setForm(f => ({ ...f, ...patch }));

  const selectEngine = (next: DatabaseEngine) => {
    setNotice(null);
    if (next !== 'sqlite' && engine !== next) {
      // Switch the port default too, unless the user typed a custom one
      const wasDefault = Object.values(DEFAULT_PORTS).map(String).includes(form.port);
      if (wasDefault) update({ port: String(DEFAULT_PORTS[next]) });
    }
    setEngine(next);
  };

  const serverInput = (): ConnectionProfileInput => ({
    engine: engine as ServerEngine,
    label: form.label,
    host: form.host,
    port: Number(form.port),
    database: form.database,
    user: form.user,
    tls: { enabled: form.tls },
    password: form.password,
    savePassword: form.savePassword && canSavePasswords,
  });

  const run = async (key: string, task: () => Promise<void>) => {
    setBusy(key);
    setNotice(null);
    try {
      await task();
    } catch (err: unknown) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Something went wrong.' });
    } finally {
      setBusy(null);
    }
  };

  const handleBrowse = () =>
    run('file', async () => {
      const filePath = await openDialog();
      if (!filePath) return;
      const res = await connectFile(filePath);
      if (res.success) {
        setFileInfo(res.data.validation);
        setNotice({ kind: 'success', text: `Opened ${res.data.active.label} (read-only).` });
      } else {
        setNotice({ kind: 'error', text: res.error.message });
      }
    });

  const handleTest = () =>
    run('test', async () => {
      const res = await testConnection({ input: serverInput() });
      setNotice(
        res.success
          ? { kind: 'success', text: `Connection works. This account can see ${res.data.tableCount} table${res.data.tableCount === 1 ? '' : 's'}.` }
          : { kind: 'error', text: res.error.message }
      );
    });

  const handleSaveAndConnect = () =>
    run('save', async () => {
      const saved = await saveProfile(serverInput());
      if (!saved.success) {
        setNotice({ kind: 'error', text: saved.error.message });
        return;
      }
      const res = await connectProfile(saved.data.id, form.password);
      if (res.success) {
        // Don't keep the password in page state longer than needed
        setForm(emptyServerForm(engine as ServerEngine));
        setNotice({ kind: 'success', text: `Connected to ${res.data.active.label}.` });
      } else {
        setNotice({ kind: 'error', text: `Saved, but could not connect: ${res.error.message}` });
      }
    });

  const handleConnectProfile = (profile: ConnectionProfile) =>
    run(profile.id, async () => {
      const typed = passwordPrompt?.profileId === profile.id ? passwordPrompt.password : undefined;
      const res = await connectProfile(profile.id, typed);
      if (res.success) {
        setPasswordPrompt(null);
        if (profile.engine === 'sqlite') setFileInfo(res.data.validation);
        setNotice({ kind: 'success', text: `Connected to ${res.data.active.label}.` });
      } else if (res.error.code === 'PASSWORD_REQUIRED') {
        setPasswordPrompt({ profileId: profile.id, password: '' });
        setNotice({ kind: 'info', text: res.error.message });
      } else {
        setNotice({ kind: 'error', text: res.error.message });
      }
    });

  const handleDelete = (profile: ConnectionProfile) => {
    const isActive = profile.id === activeConnection?.connectionId;
    const confirmed = window.confirm(
      `Delete the saved connection "${profile.label}"?${isActive ? ' It will be disconnected first.' : ''} The database itself is not changed.`
    );
    if (!confirmed) return;
    void run(`delete-${profile.id}`, async () => {
      const res = await deleteProfile(profile.id);
      setNotice(res.success ? { kind: 'success', text: `Deleted "${profile.label}".` } : { kind: 'error', text: res.error.message });
    });
  };

  const handleDisconnect = () =>
    run('disconnect', async () => {
      await disconnect();
      setFileInfo(null);
      setNotice({ kind: 'info', text: 'Disconnected.' });
    });

  return (
    <AppLayout title="Database Manager">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '1000px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Connections</h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
            Open a SQLite file or connect to a MySQL or PostgreSQL server. Only one database is active at a time, and queries are always read-only.
          </p>
        </div>

        <NoticeBanner notice={notice} />

        {/* Active connection */}
        <Card
          title="Active Connection"
          headerAction={
            activeConnection ? <Badge variant="success">Connected (Read-Only)</Badge> : <Badge variant="outline">Not connected</Badge>
          }
        >
          {activeConnection ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Badge variant="accent">{ENGINE_LABELS[activeConnection.engine]}</Badge>
                  <strong style={{ fontFamily: 'var(--font-mono)' }}>{activeConnection.label}</strong>
                </div>
                {activeProfile && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                    {describeProfile(activeProfile)}
                  </span>
                )}
                {fileInfo?.fileSizeInBytes !== undefined && activeConnection.engine === 'sqlite' && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                    {(fileInfo.fileSizeInBytes / 1024).toFixed(2)} KB · SQLite 3 header valid
                  </span>
                )}
              </div>
              <Button variant="outline" icon={<Unplug size={16} />} isLoading={busy === 'disconnect'} onClick={handleDisconnect}>
                Disconnect
              </Button>
            </div>
          ) : (
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
              No database is connected. Choose a file or server below.
            </p>
          )}
        </Card>

        {/* New connection */}
        <Card title="New Connection">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div role="group" aria-label="Database engine" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {(Object.keys(ENGINE_LABELS) as DatabaseEngine[]).map(e => (
                <Button
                  key={e}
                  variant={engine === e ? 'primary' : 'outline'}
                  aria-pressed={engine === e}
                  onClick={() => selectEngine(e)}
                >
                  {ENGINE_LABELS[e]}
                </Button>
              ))}
            </div>

            {engine === 'sqlite' ? (
              <div
                style={{
                  border: '2px dashed var(--color-border-strong)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '2rem 1.5rem',
                  textAlign: 'center',
                  backgroundColor: 'var(--color-bg-elevated)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.75rem',
                }}
              >
                <UploadCloud size={28} style={{ color: 'var(--color-accent)' }} />
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Choose a SQLite database file</h3>
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.825rem', marginTop: '0.25rem' }}>
                    <code>.db</code>, <code>.sqlite</code> and <code>.sqlite3</code> files are opened read-only and remembered below.
                  </p>
                </div>
                <Button variant="primary" icon={<FolderOpen size={16} />} isLoading={busy === 'file'} onClick={handleBrowse} disabled={!available}>
                  Browse Files
                </Button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                  {([
                    ['label', 'Connection name (optional)', 'text'],
                    ['database', 'Database name', 'text'],
                    ['host', 'Host', 'text'],
                    ['port', 'Port', 'text'],
                    ['user', 'Username', 'text'],
                    ['password', 'Password', 'password'],
                  ] as const).map(([key, label, type]) => (
                    <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <label htmlFor={`conn-${key}`} style={labelStyle}>{label}</label>
                      <input
                        id={`conn-${key}`}
                        type={type}
                        inputMode={key === 'port' ? 'numeric' : undefined}
                        autoComplete={key === 'password' ? 'off' : undefined}
                        value={form[key]}
                        onChange={ev => update({ [key]: ev.target.value } as Partial<ServerForm>)}
                        style={{ ...inputStyle, fontFamily: key === 'host' || key === 'port' || key === 'user' ? 'var(--font-mono)' : inputStyle.fontFamily }}
                      />
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input type="checkbox" checked={form.tls} onChange={ev => update({ tls: ev.target.checked })} />
                    Use TLS and verify the server certificate
                  </label>
                  <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginLeft: '1.6rem' }}>
                    Leave off for a local server (e.g. localhost). Turn on only for a remote server whose certificate
                    your computer trusts — a local/self-signed server will fail certificate verification.
                  </span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: canSavePasswords ? 1 : 0.6 }}>
                    <input
                      type="checkbox"
                      checked={form.savePassword && canSavePasswords}
                      disabled={!canSavePasswords}
                      onChange={ev => update({ savePassword: ev.target.checked })}
                    />
                    Save the password (encrypted by the operating system)
                  </label>
                  {!canSavePasswords && (
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-warning)' }}>
                      Secure password storage isn&apos;t available on this computer, so you&apos;ll be asked for the password each time.
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'flex-end' }}>
                  <Button variant="outline" isLoading={busy === 'test'} onClick={handleTest}>
                    Test Connection
                  </Button>
                  <Button variant="primary" icon={<Plug size={16} />} isLoading={busy === 'save'} onClick={handleSaveAndConnect}>
                    Save &amp; Connect
                  </Button>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <ShieldCheck size={14} /> Use a read-only database account. SQL Sensi can never do more than the account itself is allowed to.
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* Saved connections */}
        <Card title="Saved Connections">
          {profiles.length === 0 ? (
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>No saved connections yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {profiles.map(profile => {
                const isActive = profile.id === activeConnection?.connectionId;
                const prompting = passwordPrompt?.profileId === profile.id;
                return (
                  <div
                    key={profile.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.6rem',
                      padding: '0.75rem 1rem',
                      borderRadius: 'var(--radius-md)',
                      border: `1px solid ${isActive ? 'var(--color-accent)' : 'var(--color-border)'}`,
                      backgroundColor: isActive ? 'var(--color-accent-muted)' : 'var(--color-bg-elevated)',
                    }}
                  >
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem' }}>
                      <Badge variant={profile.engine === 'sqlite' ? 'default' : 'info'} size="sm">
                        {ENGINE_LABELS[profile.engine]}
                      </Badge>
                      <div style={{ flex: '1 1 240px', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 600 }}>{profile.label}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                          {describeProfile(profile)}
                          {profile.engine !== 'sqlite' && !profile.hasSavedPassword ? ' · password not saved' : ''}
                        </span>
                      </div>
                      {isActive ? (
                        <Badge variant="success" size="sm">Active</Badge>
                      ) : (
                        <Button size="sm" variant="secondary" icon={<Plug size={14} />} isLoading={busy === profile.id} onClick={() => handleConnectProfile(profile)}>
                          {activeConnection ? 'Switch' : 'Connect'}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Trash2 size={14} />}
                        aria-label={`Delete ${profile.label}`}
                        isLoading={busy === `delete-${profile.id}`}
                        onClick={() => handleDelete(profile)}
                      />
                    </div>

                    {prompting && (
                      <form
                        onSubmit={ev => {
                          ev.preventDefault();
                          void handleConnectProfile(profile);
                        }}
                        style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}
                      >
                        <label htmlFor={`pw-${profile.id}`} style={labelStyle}>Password</label>
                        <input
                          id={`pw-${profile.id}`}
                          type="password"
                          autoComplete="off"
                          autoFocus
                          value={passwordPrompt.password}
                          onChange={ev => setPasswordPrompt({ profileId: profile.id, password: ev.target.value })}
                          style={{ ...inputStyle, flex: '1 1 200px', width: 'auto' }}
                        />
                        <Button size="sm" variant="primary" type="submit" isLoading={busy === profile.id}>Connect</Button>
                        <Button size="sm" variant="ghost" type="button" onClick={() => setPasswordPrompt(null)}>Cancel</Button>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card title="When You Switch">
          <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            <li>The previous connection is closed.</li>
            <li>Queries prepared for the old database are refused instead of running on the new one.</li>
            <li>Schema and results reload for the new database.</li>
          </ul>
        </Card>
      </div>
    </AppLayout>
  );
}
