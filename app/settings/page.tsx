'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AppLayout } from '@/src/components/layout/AppLayout';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Badge';
import { Save, ShieldCheck, ShieldAlert, Lock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/src/hooks/useAuth';
import { readSession } from '@/src/utils/session-storage';
import type { WritePolicy, WriteOperation, BroadMutationHandling } from '@/src/types';

const WRITE_OPS: WriteOperation[] = ['insert', 'update', 'delete'];
const BROAD_MODES: { value: BroadMutationHandling; label: string; hint: string }[] = [
  { value: 'block', label: 'Block', hint: 'Refuse an UPDATE/DELETE with no WHERE clause.' },
  { value: 'confirm', label: 'Strong confirm', hint: 'Allow only after an extra confirmation.' },
  { value: 'allow', label: 'Allow', hint: 'Permit broad mutations (not recommended).' },
];

export default function SettingsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [policy, setPolicy] = useState<WritePolicy | null>(null);
  const [draft, setDraft] = useState<WritePolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const token = typeof window !== 'undefined' ? readSession()?.token ?? null : null;

  const load = useCallback(async () => {
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
    if (!api || !token) {
      setLoading(false);
      setError(!token ? 'You must be signed in to view the safety policy.' : 'Not running in the desktop app.');
      return;
    }
    setLoading(true);
    const res = await api.policy.get(token);
    if (res.success) {
      setPolicy(res.data);
      setDraft(res.data);
      setError(null);
    } else {
      setError(res.error.message);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    if (!authLoading) void load();
  }, [authLoading, load]);

  const patch = (changes: Partial<WritePolicy>) => setDraft((d) => (d ? { ...d, ...changes } : d));

  const toggleOp = (op: WriteOperation) => {
    if (!draft) return;
    const has = draft.allowedOperations.includes(op);
    patch({
      allowedOperations: has ? draft.allowedOperations.filter((o) => o !== op) : [...draft.allowedOperations, op],
    });
  };

  const save = async () => {
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
    if (!api || !token || !draft) return;
    setSaving(true);
    setError(null);
    const res = await api.policy.update(token, {
      enableWrites: draft.enableWrites,
      allowedOperations: draft.allowedOperations,
      requireSqlPreview: draft.requireSqlPreview,
      requireWriteConfirmation: draft.requireWriteConfirmation,
      broadMutationHandling: draft.broadMutationHandling,
      useTransaction: draft.useTransaction,
      maxRows: draft.maxRows,
      statementTimeoutMs: draft.statementTimeoutMs,
      audit: draft.audit,
    });
    if (res.success) {
      setPolicy(res.data);
      setDraft(res.data);
      setSavedAt(Date.now());
    } else {
      setError(res.error.message);
    }
    setSaving(false);
  };

  const dirty = !!draft && !!policy && JSON.stringify(draft) !== JSON.stringify(policy);

  return (
    <AppLayout title="Settings" databaseName="">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '820px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Safety & write policy</h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
            The administrator controls whether writes are allowed, which operations are permitted, and how writes are
            confirmed and audited. Enforced in the trusted main process — never from this screen alone.
          </p>
        </div>

        {loading || authLoading ? (
          <Card title="Loading policy…"><div style={{ padding: '1rem', color: 'var(--color-text-secondary)' }}>Reading the current policy…</div></Card>
        ) : error && !draft ? (
          <div role="alert" style={alertStyle('danger')}>
            <AlertTriangle size={16} /> {error}
          </div>
        ) : draft ? (
          <>
            {!isAdmin && (
              <div role="status" style={alertStyle('muted')}>
                <Lock size={16} /> You are signed in as a standard user. These settings are read-only; only an
                administrator can change them.
              </div>
            )}

            {savedAt && !dirty && (
              <div role="status" style={alertStyle('success')}>
                <CheckCircle2 size={16} /> Policy saved.
              </div>
            )}
            {error && (
              <div role="alert" style={alertStyle('danger')}><AlertTriangle size={16} /> {error}</div>
            )}

            {/* Master switch */}
            <Card
              title="Database writes"
              subtitle="INSERT / UPDATE / DELETE. Off by default; the engine still enforces the DB account's own privileges."
              headerAction={
                <Badge variant={draft.enableWrites ? 'warning' : 'default'}>
                  {draft.enableWrites ? 'Writes enabled' : 'Read-only'}
                </Badge>
              }
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <Toggle
                  label="Enable write operations"
                  description="When off, every INSERT/UPDATE/DELETE is denied regardless of other settings."
                  checked={draft.enableWrites}
                  disabled={!isAdmin}
                  onChange={(v) => patch({ enableWrites: v })}
                  icon={draft.enableWrites ? <ShieldAlert size={16} /> : <ShieldCheck size={16} />}
                />

                <div style={{ opacity: draft.enableWrites ? 1 : 0.5, pointerEvents: draft.enableWrites ? 'auto' : 'none' }}>
                  <label style={fieldLabel}>Permitted operations</label>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {WRITE_OPS.map((op) => {
                      const on = draft.allowedOperations.includes(op);
                      return (
                        <button
                          key={op}
                          type="button"
                          disabled={!isAdmin}
                          onClick={() => toggleOp(op)}
                          style={{
                            padding: '0.4rem 0.9rem',
                            borderRadius: 'var(--radius-md)',
                            textTransform: 'uppercase',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            letterSpacing: '0.03em',
                            cursor: isAdmin ? 'pointer' : 'default',
                            border: on ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
                            backgroundColor: on ? 'var(--color-bg-elevated)' : 'var(--color-bg-base)',
                            color: on ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                          }}
                        >
                          {op}
                        </button>
                      );
                    })}
                  </div>
                  <span style={hintStyle}>CREATE/ALTER/DROP are out of scope and always refused.</span>
                </div>
              </div>
            </Card>

            {/* Confirmation */}
            <Card title="Preview & confirmation" subtitle="How a write is reviewed before it runs.">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <Toggle
                  label="Require SQL preview"
                  description="Show the exact statement and wait before any write runs."
                  checked={draft.requireSqlPreview}
                  disabled={!isAdmin}
                  onChange={(v) => patch({ requireSqlPreview: v })}
                />
                <Toggle
                  label="Require confirmation"
                  description="A confirmation step for every write."
                  checked={draft.requireWriteConfirmation}
                  disabled={!isAdmin}
                  onChange={(v) => patch({ requireWriteConfirmation: v })}
                />
                <div>
                  <label style={fieldLabel}>Broad UPDATE/DELETE (no WHERE)</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                    {BROAD_MODES.map((m) => {
                      const on = draft.broadMutationHandling === m.value;
                      return (
                        <button
                          key={m.value}
                          type="button"
                          disabled={!isAdmin}
                          onClick={() => patch({ broadMutationHandling: m.value })}
                          title={m.hint}
                          style={{
                            padding: '0.6rem 0.5rem',
                            borderRadius: 'var(--radius-md)',
                            textAlign: 'center',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            cursor: isAdmin ? 'pointer' : 'default',
                            border: on ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
                            backgroundColor: on ? 'var(--color-bg-elevated)' : 'var(--color-bg-base)',
                            color: on ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                          }}
                        >
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <Toggle
                  label="Use a transaction where supported"
                  description="Wrap each write in a transaction so it can be rolled back on error."
                  checked={draft.useTransaction}
                  disabled={!isAdmin}
                  onChange={(v) => patch({ useTransaction: v })}
                />
              </div>
            </Card>

            {/* Limits */}
            <Card title="Limits" subtitle="Resource ceilings applied to reads and writes.">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <NumberField
                  label="Max rows returned"
                  value={draft.maxRows}
                  disabled={!isAdmin}
                  min={1}
                  onChange={(n) => patch({ maxRows: n })}
                />
                <NumberField
                  label="Statement timeout (ms)"
                  value={draft.statementTimeoutMs}
                  disabled={!isAdmin}
                  min={100}
                  onChange={(n) => patch({ statementTimeoutMs: n })}
                />
              </div>
            </Card>

            {/* Audit */}
            <Card title="Audit log" subtitle="Metadata-only record of write attempts (no raw SQL, no row values).">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <Toggle
                  label="Record an audit event for every write"
                  description="Allowed, failed and denied writes are logged with a SHA-256 of the statement."
                  checked={draft.audit.enabled}
                  disabled={!isAdmin}
                  onChange={(v) => patch({ audit: { ...draft.audit, enabled: v } })}
                />
                <NumberField
                  label="Retention (days)"
                  value={draft.audit.retentionDays}
                  disabled={!isAdmin}
                  min={1}
                  onChange={(n) => patch({ audit: { ...draft.audit, retentionDays: n } })}
                />
                <span style={hintStyle}>View the log on the Audit page (administrators only).</span>
              </div>
            </Card>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <Button variant="primary" icon={<Save size={16} />} disabled={!isAdmin || !dirty || saving} onClick={save}>
                {saving ? 'Saving…' : 'Save policy'}
              </Button>
              <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
                {policy?.updatedAt ? `Last changed ${new Date(policy.updatedAt).toLocaleString()}` : ''}
              </span>
            </div>
          </>
        ) : null}
      </div>
    </AppLayout>
  );
}

// ─── Small local controls (token-styled) ──────────────────────

const fieldLabel: React.CSSProperties = {
  display: 'block',
  fontSize: '0.85rem',
  fontWeight: 600,
  marginBottom: '0.5rem',
};
const hintStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: 'var(--color-text-secondary)',
  marginTop: '0.4rem',
  display: 'block',
};

function alertStyle(kind: 'danger' | 'success' | 'muted'): React.CSSProperties {
  const bg =
    kind === 'danger' ? 'var(--color-danger-muted)' : kind === 'success' ? 'var(--color-success-muted)' : 'var(--color-bg-base)';
  const fg =
    kind === 'danger' ? 'var(--color-danger)' : kind === 'success' ? 'var(--color-success)' : 'var(--color-text-secondary)';
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem 1rem',
    borderRadius: 'var(--radius-lg)',
    backgroundColor: bg,
    color: fg,
    fontSize: '0.85rem',
  };
}

function Toggle({
  label,
  description,
  checked,
  disabled,
  onChange,
  icon,
}: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  icon?: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 600, fontSize: '0.9rem' }}>
          {icon}
          {label}
        </div>
        {description && (
          <p style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginTop: '0.2rem' }}>{description}</p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        style={{
          flexShrink: 0,
          width: 44,
          height: 24,
          borderRadius: 999,
          border: 'none',
          cursor: disabled ? 'default' : 'pointer',
          backgroundColor: checked ? 'var(--color-accent)' : 'var(--color-border)',
          position: 'relative',
          transition: 'background-color 0.15s',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: checked ? 22 : 2,
            width: 20,
            height: 20,
            borderRadius: '50%',
            backgroundColor: '#fff',
            transition: 'left 0.15s',
          }}
        />
      </button>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  disabled,
  min,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
  min?: number;
}) {
  return (
    <div>
      <label style={fieldLabel}>{label}</label>
      <input
        type="number"
        value={value}
        min={min}
        disabled={disabled}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        style={{
          width: '100%',
          padding: '0.5rem 0.75rem',
          backgroundColor: 'var(--color-bg-base)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--color-text-primary)',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.85rem',
          opacity: disabled ? 0.6 : 1,
        }}
      />
    </div>
  );
}
