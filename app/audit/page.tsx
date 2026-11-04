'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AppLayout } from '@/src/components/layout/AppLayout';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Badge';
import { RefreshCw, ShieldAlert, Lock, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/src/hooks/useAuth';
import { readSession } from '@/src/utils/session-storage';
import type { AuditRecord, AuditOutcome } from '@/src/types';

const OUTCOME_VARIANT: Record<AuditOutcome, 'success' | 'danger' | 'warning'> = {
  success: 'success',
  failure: 'danger',
  denied: 'warning',
};

export default function AuditPage() {
  const { user, isLoading: authLoading } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [records, setRecords] = useState<AuditRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
    const token = typeof window !== 'undefined' ? readSession()?.token : undefined;
    if (!api || !token) {
      setLoading(false);
      setError(!token ? 'You must be signed in to view the audit log.' : 'Not running in the desktop app.');
      return;
    }
    setLoading(true);
    const res = await api.audit.list(token, 200);
    if (res.success) {
      setRecords(res.data);
      setError(null);
    } else {
      setError(res.error.message);
      setRecords(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!authLoading) void load();
  }, [authLoading, load]);

  return (
    <AppLayout title="Audit Log" databaseName="">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '1100px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Write audit log</h1>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', maxWidth: '640px' }}>
              Every write attempt — allowed, failed or denied — recorded as metadata only. No raw SQL and no row values
              are stored; each statement is identified by a SHA-256 fingerprint.
            </p>
          </div>
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={load} disabled={loading}>
            Refresh
          </Button>
        </div>

        {authLoading || loading ? (
          <Card title="Loading…"><div style={{ padding: '1rem', color: 'var(--color-text-secondary)' }}>Reading the audit log…</div></Card>
        ) : !isAdmin ? (
          <div role="status" style={bannerStyle('muted')}>
            <Lock size={16} /> The audit log is available to administrators only.
          </div>
        ) : error ? (
          <div role="alert" style={bannerStyle('danger')}>
            <AlertTriangle size={16} /> {error}
          </div>
        ) : records && records.length > 0 ? (
          <Card title={`${records.length} recent event${records.length === 1 ? '' : 's'}`} subtitle="Most recent first">
            <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
              <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead style={{ backgroundColor: 'var(--color-bg-elevated)', color: 'var(--color-text-secondary)', textAlign: 'left' }}>
                  <tr>
                    {['When', 'Outcome', 'Operation', 'Table', 'Rows', 'Engine', 'Error', 'Policy', 'Fingerprint'].map((h) => (
                      <th key={h} style={{ padding: '0.55rem 0.6rem', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                      <td style={cell} title={r.createdAt}>{new Date(r.createdAt).toLocaleString()}</td>
                      <td style={cell}>
                        <Badge variant={OUTCOME_VARIANT[r.outcome]} size="sm">{r.outcome}</Badge>
                      </td>
                      <td style={{ ...cell, textTransform: 'uppercase', fontWeight: 600 }}>{r.operation}</td>
                      <td style={cell}>{r.tableName ?? '—'}</td>
                      <td style={{ ...cell, fontFamily: 'var(--font-mono)' }}>{r.affectedRows ?? '—'}</td>
                      <td style={cell}>{r.engine ?? '—'}</td>
                      <td style={{ ...cell, color: r.errorCode ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>{r.errorCode ?? '—'}</td>
                      <td style={{ ...cell, fontFamily: 'var(--font-mono)' }}>v{r.policyVersion}</td>
                      <td style={{ ...cell, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }} title={r.sqlSha256}>
                        {r.sqlSha256.slice(0, 12)}…
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <Card title="No events yet">
            <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--color-text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
              <ShieldAlert size={28} style={{ color: 'var(--color-text-muted)' }} />
              No write attempts have been recorded. Events appear here once writes are enabled and run.
            </div>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}

const cell: React.CSSProperties = { padding: '0.5rem 0.6rem', whiteSpace: 'nowrap' };

function bannerStyle(kind: 'danger' | 'muted'): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.9rem 1.1rem',
    borderRadius: 'var(--radius-lg)',
    backgroundColor: kind === 'danger' ? 'var(--color-danger-muted)' : 'var(--color-bg-base)',
    color: kind === 'danger' ? 'var(--color-danger)' : 'var(--color-text-secondary)',
    fontSize: '0.85rem',
  };
}
