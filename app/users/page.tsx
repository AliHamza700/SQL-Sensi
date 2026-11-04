'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AppLayout } from '@/src/components/layout/AppLayout';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Badge';
import { Lock, AlertTriangle, ShieldCheck, ShieldOff, UserCog } from 'lucide-react';
import { useAuth } from '@/src/hooks/useAuth';
import { readSession } from '@/src/utils/session-storage';
import type { User } from '@/src/types';

export default function UsersPage() {
  const { user, isLoading: authLoading } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [users, setUsers] = useState<User[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const token = typeof window !== 'undefined' ? readSession()?.token ?? null : null;

  const load = useCallback(async () => {
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
    if (!api || !token) {
      setLoading(false);
      setError(!token ? 'You must be signed in.' : 'Not running in the desktop app.');
      return;
    }
    setLoading(true);
    const res = await api.users.list(token);
    if (res.success) {
      setUsers(res.data);
      setError(null);
    } else {
      setError(res.error.message);
      setUsers(null);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    if (!authLoading) void load();
  }, [authLoading, load]);

  const changeRole = async (target: User, role: 'admin' | 'standard') => {
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
    if (!api || !token) return;
    setBusyId(target.id);
    setError(null);
    const res = await api.users.setRole(token, target.id, role);
    if (!res.success) setError(res.error.message);
    await load();
    setBusyId(null);
  };

  const adminCount = users?.filter((u) => u.role === 'admin').length ?? 0;

  return (
    <AppLayout title="Users & roles" databaseName="">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '860px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Users &amp; roles</h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', maxWidth: '640px' }}>
            Administrators control the safety policy and can make database changes. Promote the people who need that
            (e.g. a manager) to <strong>admin</strong>; everyone else stays a read-only standard user. Enforced in the
            trusted main process.
          </p>
        </div>

        {authLoading || loading ? (
          <Card title="Loading…"><div style={{ padding: '1rem', color: 'var(--color-text-secondary)' }}>Reading accounts…</div></Card>
        ) : !isAdmin ? (
          <div role="status" style={banner('muted')}>
            <Lock size={16} /> Only an administrator can manage user roles.
          </div>
        ) : error && !users ? (
          <div role="alert" style={banner('danger')}><AlertTriangle size={16} /> {error}</div>
        ) : users ? (
          <>
            {error && <div role="alert" style={banner('danger')}><AlertTriangle size={16} /> {error}</div>}
            <Card title={`${users.length} account${users.length === 1 ? '' : 's'}`} subtitle={`${adminCount} administrator${adminCount === 1 ? '' : 's'}`}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {users.map((u) => {
                  const isSelf = u.id === user?.id;
                  const isLastAdmin = u.role === 'admin' && adminCount <= 1;
                  return (
                    <div
                      key={u.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '0.7rem 0.9rem',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--color-border)',
                        backgroundColor: 'var(--color-bg-elevated)',
                      }}
                    >
                      <UserCog size={18} style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />
                      <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                        <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {u.email} {isSelf && <span style={{ color: 'var(--color-text-secondary)', fontWeight: 400 }}>(you)</span>}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                          joined {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}
                        </div>
                      </div>
                      <Badge variant={u.role === 'admin' ? 'accent' : 'default'} size="sm">{u.role}</Badge>
                      {u.role === 'standard' ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={<ShieldCheck size={14} />}
                          isLoading={busyId === u.id}
                          onClick={() => changeRole(u, 'admin')}
                        >
                          Make admin
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          icon={<ShieldOff size={14} />}
                          isLoading={busyId === u.id}
                          disabled={isLastAdmin}
                          title={isLastAdmin ? 'Promote another admin first — the app must keep at least one.' : undefined}
                          onClick={() => changeRole(u, 'standard')}
                        >
                          Revoke admin
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginTop: '0.9rem', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <ShieldCheck size={14} /> A user must sign out and back in for a role change to take effect in their session. The app always keeps at least one administrator.
              </p>
            </Card>
          </>
        ) : null}
      </div>
    </AppLayout>
  );
}

function banner(kind: 'danger' | 'muted'): React.CSSProperties {
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
