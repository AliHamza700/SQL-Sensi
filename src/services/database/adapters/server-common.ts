/**
 * Shared helpers for server adapters (MySQL, PostgreSQL) — SQL Sensi V2
 *
 * Config validation, error normalization with secret redaction,
 * query serialization and plan-tree flattening.
 */

import type { AppError, QueryPlan, QueryPlanNode, ServerConnectionConfig, ServiceResult } from '@/src/types';
import { createError } from '@/src/utils/errors';

/** How long to wait for a server to accept the connection */
export const CONNECT_TIMEOUT_MS = 10_000;

/** Validates the fields of a server connection before any network call. */
export function validateServerConfig(config: ServerConnectionConfig): string | null {
  if (!config.host?.trim()) return 'Host is required.';
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    return 'Port must be a whole number between 1 and 65535.';
  }
  if (!config.database?.trim()) return 'Database name is required.';
  if (!config.user?.trim()) return 'Username is required.';
  if (typeof config.password !== 'string') return 'Password must be text.';
  return null;
}

/** Display label for a server connection: database and host only, never the user or password. */
export function serverLabel(config: ServerConnectionConfig): string {
  return `${config.database} @ ${config.host}`;
}

/** Removes secrets from text that may be shown or logged. */
export function redact(text: string, secrets: string[]): string {
  let out = text;
  for (const secret of secrets) {
    if (secret) out = out.split(secret).join('[redacted]');
  }
  return out;
}

interface DriverError {
  message?: unknown;
  code?: unknown;
  errno?: unknown;
}

/** Network-level failures shared by both drivers */
const NETWORK_CODES: Record<string, string> = {
  ECONNREFUSED: 'The server refused the connection. Check the host, port and that the server is running.',
  ENOTFOUND: 'The host name could not be found.',
  ETIMEDOUT: 'The connection to the server timed out.',
  ECONNRESET: 'The connection to the server was reset.',
  EHOSTUNREACH: 'The server could not be reached.',
};

/**
 * TLS/certificate failures. These happen with "Use TLS" enabled against a server
 * whose certificate cannot be verified — very common for local or self-signed
 * servers (MySQL 8 auto-generates self-signed certs). The fix is almost always
 * to turn off "Use TLS" for a local server, or to supply the server's CA.
 */
const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'CERT_HAS_EXPIRED',
  'HANDSHAKE_SSL_ERROR',
  'HANDSHAKE_NO_SSL_SUPPORT',
]);

const TLS_MESSAGE =
  'Could not establish a secure (TLS) connection: the server certificate could not be verified. ' +
  'If this is a local or self-signed server, turn off "Use TLS" in the connection form, or supply the server\'s CA certificate.';

/** True when a driver error looks like a TLS/certificate verification failure. */
function isTlsError(code: string, message: string): boolean {
  if (TLS_CODES.has(code)) return true;
  const m = message.toLowerCase();
  return (
    m.includes('self signed certificate') ||
    m.includes('self-signed certificate') ||
    m.includes('unable to verify') ||
    m.includes('does not support ssl') ||
    (m.includes('ssl') && m.includes('certificate'))
  );
}

/**
 * Engine-specific error-code tables: driver code → [AppErrorCode, user-facing text].
 * Anything not listed keeps the driver message (redacted).
 */
export type ErrorTable = Record<string, [AppError['code'], string]>;

/** Turns a driver error into an AppError with secrets removed. */
export function normalizeServerError(
  error: unknown,
  prefix: string,
  table: ErrorTable,
  secrets: string[]
): AppError {
  const e = (error ?? {}) as DriverError;
  const code = typeof e.code === 'string' ? e.code : typeof e.errno === 'number' ? String(e.errno) : '';
  const raw = typeof e.message === 'string' && e.message ? e.message : 'Unknown database error';
  const message = redact(raw, secrets);

  if (isTlsError(code, message)) {
    return createError('DATABASE_ERROR', TLS_MESSAGE, message);
  }
  if (NETWORK_CODES[code]) {
    return createError('DATABASE_ERROR', NETWORK_CODES[code], message);
  }
  const mapped = table[code];
  if (mapped) {
    return createError(mapped[0], `${prefix}: ${mapped[1]}`, message);
  }
  return createError('SQL_EXECUTION_ERROR', `${prefix}: ${message}`);
}

/** Wraps a failure in a ServiceResult */
export function fail<T>(error: AppError): ServiceResult<T> {
  return { success: false, error };
}

/**
 * Runs async work one call at a time. A single driver connection must not
 * interleave the BEGIN / query / ROLLBACK sequences of two requests.
 */
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.tail.then(task, task);
    this.tail = next.catch(() => undefined);
    return next;
  }
}

/** A plan step with its children, before flattening */
export interface PlanTreeNode {
  detail: string;
  operation?: string;
  children: PlanTreeNode[];
}

/** Flattens a plan tree into QueryPlan nodes (root parentId = 0) and an indented text view. */
export function flattenPlan(roots: PlanTreeNode[]): QueryPlan {
  const nodes: QueryPlanNode[] = [];
  const lines: string[] = [];
  let nextId = 1;

  const walk = (node: PlanTreeNode, parentId: number, depth: number) => {
    const id = nextId++;
    nodes.push({ id, parentId, detail: node.detail, operation: node.operation });
    lines.push(`${'  '.repeat(depth)}- ${node.detail}`);
    node.children.forEach(child => walk(child, id, depth + 1));
  };
  roots.forEach(root => walk(root, 0, 0));

  return { nodes, rawOutput: lines.join('\n') };
}
