/**
 * Connection payload validation — SQL Sensi V2
 *
 * Everything arriving over IPC is untrusted. These checks run in the main
 * process before any profile is stored or any connection is attempted.
 */

import type { ConnectionProfileInput, ServiceResult } from '@/src/types';
import { createError } from '@/src/utils/errors';

const MAX = { label: 80, path: 4096, host: 255, name: 128, password: 1024, id: 64 };

type Raw = Record<string, unknown>;

function invalid<T>(message: string): ServiceResult<T> {
  return { success: false, error: createError('DATABASE_ERROR', message) };
}

function text(value: unknown, field: string, max: number, required = true): string | Error {
  if (value === undefined || value === null || value === '') {
    return required ? new Error(`${field} is required.`) : '';
  }
  if (typeof value !== 'string') return new Error(`${field} must be text.`);
  const trimmed = value.trim();
  if (required && !trimmed) return new Error(`${field} is required.`);
  if (trimmed.length > max) return new Error(`${field} must be at most ${max} characters.`);
  return trimmed;
}

/** A connection or profile id from the renderer */
export function validateId(value: unknown): ServiceResult<string> {
  if (typeof value !== 'string' || !/^[A-Za-z0-9-]{1,64}$/.test(value)) {
    return invalid('Invalid connection id.');
  }
  return { success: true, data: value };
}

/** An optional password typed by the user (never trimmed) */
export function validatePassword(value: unknown): ServiceResult<string | undefined> {
  if (value === undefined || value === null) return { success: true, data: undefined };
  if (typeof value !== 'string' || value.length > MAX.password) return invalid('Invalid password.');
  return { success: true, data: value };
}

export function validateFilePath(value: unknown): ServiceResult<string> {
  const filePath = text(value, 'File path', MAX.path);
  if (filePath instanceof Error) return invalid(filePath.message);
  return { success: true, data: filePath };
}

/** Validates and normalizes a profile from the renderer. */
export function validateProfileInput(value: unknown): ServiceResult<ConnectionProfileInput> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return invalid('Connection details are missing.');
  }
  const raw = value as Raw;

  let id: string | undefined;
  if (raw.id !== undefined) {
    const checked = validateId(raw.id);
    if (!checked.success) return checked;
    id = checked.data;
  }

  const label = text(raw.label, 'Connection name', MAX.label, false);
  if (label instanceof Error) return invalid(label.message);

  if (raw.engine === 'sqlite') {
    const filePath = validateFilePath(raw.filePath);
    if (!filePath.success) return filePath;
    const fallback = filePath.data.split(/[/\\]/).pop() ?? 'SQLite database';
    return { success: true, data: { id, engine: 'sqlite', label: label || fallback, filePath: filePath.data } };
  }

  if (raw.engine !== 'mysql' && raw.engine !== 'postgresql') {
    return invalid('Choose SQLite, MySQL or PostgreSQL.');
  }

  const host = text(raw.host, 'Host', MAX.host);
  if (host instanceof Error) return invalid(host.message);
  if (/\s/.test(host)) return invalid('Host must not contain spaces.');

  const port = typeof raw.port === 'string' && raw.port.trim() !== '' ? Number(raw.port) : raw.port;
  if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) {
    return invalid('Port must be a whole number between 1 and 65535.');
  }

  const database = text(raw.database, 'Database name', MAX.name);
  if (database instanceof Error) return invalid(database.message);
  const user = text(raw.user, 'Username', MAX.name);
  if (user instanceof Error) return invalid(user.message);

  const password = validatePassword(raw.password);
  if (!password.success) return password;

  const tls = raw.tls as Raw | undefined;
  if (!tls || typeof tls.enabled !== 'boolean') return invalid('TLS setting is missing.');
  if (typeof raw.savePassword !== 'boolean') return invalid('Save-password setting is missing.');

  const finalLabel = label || `${database} @ ${host}`;
  if (password.data && finalLabel.includes(password.data)) {
    return invalid('The connection name must not contain the password.');
  }

  return {
    success: true,
    data: {
      id,
      engine: raw.engine,
      label: finalLabel,
      host,
      port,
      database,
      user,
      tls: { enabled: tls.enabled },
      password: password.data,
      savePassword: raw.savePassword,
    },
  };
}
