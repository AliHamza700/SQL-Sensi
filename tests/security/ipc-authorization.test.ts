/**
 * IPC Authorization Tests — SQL Sensi V2 Phase 9
 *
 * The audit log is admin-only. These tests drive the real IPC handler through a
 * mocked `ipcMain` to prove the trusted boundary rejects callers who are
 * unauthenticated, have an invalid session, or are standard users — the renderer
 * can never assert its own role (rules.md §3; Phase 9 task 3).
 */

import type { ServiceResult, User } from '../../src/types';

// ── Capture the handlers registered on ipcMain ────────────────
type Handler = (event: unknown, ...args: unknown[]) => unknown;
const handlers = new Map<string, Handler>();

jest.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: Handler) => handlers.set(channel, handler),
  },
}));

// ── Control the session the token resolves to ─────────────────
const validateSession = jest.fn<Promise<ServiceResult<User>>, [string]>();
jest.mock('../../electron/src/ipc/auth.ipc', () => ({
  getAuthService: () => ({ validateSession }),
}));

// ── Stub the audit service so no real audit.db is touched ─────
const auditList = jest.fn(() => ({ success: true, data: [] }));
const auditPrune = jest.fn(() => ({ success: true, data: 0 }));
jest.mock('../../src/services/audit/audit.service', () => ({
  getAuditService: () => ({ list: auditList, prune: auditPrune }),
}));

import { registerAuditHandlers } from '../../electron/src/ipc/audit.ipc';
import { IPC_CHANNELS } from '../../src/config/ipc-channels';

const admin: User = { id: 'u-admin', email: 'a@test', role: 'admin', createdAt: '' };
const standard: User = { id: 'u-std', email: 's@test', role: 'standard', createdAt: '' };

beforeAll(() => registerAuditHandlers());
beforeEach(() => {
  validateSession.mockReset();
  auditList.mockClear();
  auditPrune.mockClear();
});

function callList(token: unknown, limit?: number) {
  return handlers.get(IPC_CHANNELS.AUDIT_LIST)!(null, token, limit) as Promise<ServiceResult<unknown>>;
}
function callPrune(token: unknown, days: unknown) {
  return handlers.get(IPC_CHANNELS.AUDIT_PRUNE)!(null, token, days) as Promise<ServiceResult<unknown>>;
}

describe('audit:list authorization', () => {
  it('rejects a missing/empty token without touching the audit service', async () => {
    const res = await callList('');
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe('NOT_AUTHORIZED');
    expect(validateSession).not.toHaveBeenCalled();
    expect(auditList).not.toHaveBeenCalled();
  });

  it('rejects an invalid session', async () => {
    validateSession.mockResolvedValue({ success: false, error: { code: 'AUTH_ERROR', message: 'bad' } });
    const res = await callList('some-token');
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe('NOT_AUTHORIZED');
    expect(auditList).not.toHaveBeenCalled();
  });

  it('rejects a valid standard-user session (not an admin)', async () => {
    validateSession.mockResolvedValue({ success: true, data: standard });
    const res = await callList('std-token');
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe('NOT_AUTHORIZED');
    expect(auditList).not.toHaveBeenCalled();
  });

  it('allows an admin and forwards the limit', async () => {
    validateSession.mockResolvedValue({ success: true, data: admin });
    const res = await callList('admin-token', 25);
    expect(res.success).toBe(true);
    expect(auditList).toHaveBeenCalledWith(25);
  });
});

describe('audit:prune authorization', () => {
  it('rejects a standard user before pruning', async () => {
    validateSession.mockResolvedValue({ success: true, data: standard });
    const res = await callPrune('std-token', 30);
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe('NOT_AUTHORIZED');
    expect(auditPrune).not.toHaveBeenCalled();
  });

  it('rejects an invalid retention value for an admin', async () => {
    validateSession.mockResolvedValue({ success: true, data: admin });
    const res = await callPrune('admin-token', 0);
    expect(res.success).toBe(false);
    expect(auditPrune).not.toHaveBeenCalled();
  });

  it('prunes for an admin with a valid retention', async () => {
    validateSession.mockResolvedValue({ success: true, data: admin });
    const res = await callPrune('admin-token', 90);
    expect(res.success).toBe(true);
    expect(auditPrune).toHaveBeenCalledWith(90);
  });
});
