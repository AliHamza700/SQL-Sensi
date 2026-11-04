/**
 * Connection Manager Tests — SQL Sensi V2 Phase 3
 *
 *   1. ConnectionStore — metadata file, atomic writes, corrupt-file handling
 *   2. SecretStore — only ciphertext on disk, no plaintext fallback
 *   3. Payload validation — what the IPC layer accepts
 *   4. ConnectionManager — connect / switch / disconnect, stale-request rejection,
 *      password handling, test connections, deleting the active profile
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ConnectionStore } from '../../src/services/connections/connection-store';
import { Encryptor, SecretStore } from '../../src/services/connections/secret-store';
import { validateId, validatePassword, validateProfileInput } from '../../src/services/connections/profile-validation';
import { ConnectionManager } from '../../src/services/connections/connection-manager';
import { DatabaseService } from '../../src/services/database/database.service';
import type { ConnectionProfileInput, ConnectionRef } from '../../src/types';
import { createSqliteFixture, SqliteFixture } from '../fixtures/sqlite-fixture';

const PASSWORD = 'Tr1cky-Pa55word!';

/** Reversible stand-in for safeStorage; output never contains the plaintext. */
function fakeEncryptor(available = true): Encryptor & { failDecrypt: boolean } {
  return {
    failDecrypt: false,
    isEncryptionAvailable: () => available,
    encryptString: (s) => Buffer.from(`enc:${Buffer.from(s).toString('hex')}`),
    decryptString(b) {
      if (this.failDecrypt) throw new Error('key changed');
      return Buffer.from(b.toString().slice(4), 'hex').toString();
    },
  };
}

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** The server-engine branch of ConnectionProfileInput */
type ServerProfileInput = Extract<ConnectionProfileInput, { savePassword: boolean }>;

function serverInput(overrides: Partial<ServerProfileInput> = {}): ServerProfileInput {
  return {
    engine: 'postgresql',
    label: 'analytics',
    host: 'db.example.test',
    port: 5432,
    database: 'analytics',
    user: 'readonly_analyst',
    tls: { enabled: true },
    password: PASSWORD,
    savePassword: true,
    ...overrides,
  };
}

// ─── ConnectionStore ─────────────────────────────────────────

describe('ConnectionStore', () => {
  let dir: string;
  let file: string;
  let store: ConnectionStore;

  beforeEach(() => {
    dir = tempDir('sqlsensi-store-');
    file = path.join(dir, 'connections.json');
    store = new ConnectionStore(file);
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const profile = (id: string, label = id) => ({
    id, label, engine: 'sqlite' as const, filePath: `/x/${id}.db`, createdAt: 't', updatedAt: 't', lastUsedAt: null,
  });

  it('starts empty without creating a file', () => {
    expect(store.list()).toEqual([]);
    expect(fs.existsSync(file)).toBe(false);
  });

  it('inserts, replaces and removes profiles', () => {
    store.upsert(profile('a'));
    store.upsert(profile('b'));
    store.upsert(profile('a', 'renamed'));
    expect(store.list().map(p => [p.id, p.label])).toEqual([['a', 'renamed'], ['b', 'b']]);
    expect(store.remove('a')).toBe(true);
    expect(store.remove('missing')).toBe(false);
    expect(store.get('b')?.label).toBe('b');
    expect(fs.existsSync(`${file}.tmp`)).toBe(false);
  });

  it('sets a corrupt file aside instead of overwriting it', () => {
    fs.writeFileSync(file, '{not json');
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(store.list()).toEqual([]);
    warn.mockRestore();
    expect(fs.readdirSync(dir).some(f => f.startsWith('connections.json.corrupt-'))).toBe(true);
  });
});

// ─── SecretStore ─────────────────────────────────────────────

describe('SecretStore', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = tempDir('sqlsensi-secrets-');
    file = path.join(dir, 'secrets.json');
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('stores only ciphertext and decrypts it back', () => {
    const secrets = new SecretStore(file, fakeEncryptor());
    expect(secrets.set('p1', PASSWORD)).toBe(true);
    expect(fs.readFileSync(file, 'utf-8')).not.toContain(PASSWORD);
    expect(secrets.has('p1')).toBe(true);
    expect(secrets.get('p1')).toBe(PASSWORD);
    secrets.delete('p1');
    expect(secrets.has('p1')).toBe(false);
  });

  it('refuses to save anything when OS encryption is unavailable', () => {
    const secrets = new SecretStore(file, fakeEncryptor(false));
    expect(secrets.isAvailable()).toBe(false);
    expect(secrets.set('p1', PASSWORD)).toBe(false);
    expect(fs.existsSync(file)).toBe(false);
    expect(secrets.get('p1')).toBeUndefined();
  });

  it('treats a password that can no longer be decrypted as missing', () => {
    const enc = fakeEncryptor();
    const secrets = new SecretStore(file, enc);
    secrets.set('p1', PASSWORD);
    enc.failDecrypt = true;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(secrets.get('p1')).toBeUndefined();
    warn.mockRestore();
  });
});

// ─── Validation ──────────────────────────────────────────────

describe('validateProfileInput', () => {
  it('accepts a SQLite file and names it after the file', () => {
    const res = validateProfileInput({ engine: 'sqlite', label: '', filePath: 'C:\\data\\sales.db' });
    expect(res.success && res.data).toEqual({ id: undefined, engine: 'sqlite', label: 'sales.db', filePath: 'C:\\data\\sales.db' });
  });

  it('accepts a server profile, trims fields and coerces a numeric port string', () => {
    const res = validateProfileInput({ ...serverInput(), label: '', host: ' db.example.test ', port: '5433' });
    expect(res.success).toBe(true);
    if (res.success && res.data.engine !== 'sqlite') {
      expect(res.data).toMatchObject({ host: 'db.example.test', port: 5433, label: 'analytics @ db.example.test', password: PASSWORD });
    }
  });

  it.each([
    [null, /missing/],
    [[], /missing/],
    [{ ...serverInput(), engine: 'oracle' }, /Choose SQLite, MySQL or PostgreSQL/],
    [{ ...serverInput(), port: 70000 }, /Port/],
    [{ ...serverInput(), port: 54.2 }, /Port/],
    [{ ...serverInput(), host: 'db example' }, /spaces/],
    [{ ...serverInput(), database: '' }, /Database name is required/],
    [{ ...serverInput(), user: 42 }, /Username must be text/],
    [{ ...serverInput(), tls: undefined }, /TLS/],
    [{ ...serverInput(), savePassword: 'yes' }, /Save-password/],
    [{ ...serverInput(), label: `prod ${PASSWORD}` }, /must not contain the password/],
    [{ ...serverInput(), id: '../../etc' }, /Invalid connection id/],
    [{ ...serverInput(), label: 'x'.repeat(81) }, /at most 80/],
    [{ engine: 'sqlite', label: '', filePath: '' }, /File path is required/],
  ])('rejects %p', (input, message) => {
    const res = validateProfileInput(input);
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.message).toMatch(message);
  });

  it('validates ids and passwords', () => {
    expect(validateId('3f2b-11aa').success).toBe(true);
    expect(validateId(5).success).toBe(false);
    expect(validatePassword(undefined).success).toBe(true);
    expect(validatePassword(' keep spaces ').success && validatePassword(' keep spaces ')).toEqual({ success: true, data: ' keep spaces ' });
    expect(validatePassword({}).success).toBe(false);
  });
});

// ─── ConnectionManager ───────────────────────────────────────

describe('ConnectionManager', () => {
  let dir: string;
  let fixtureA: SqliteFixture;
  let fixtureB: SqliteFixture;
  let db: DatabaseService;
  let enc: ReturnType<typeof fakeEncryptor>;
  let manager: ConnectionManager;
  let events: (ConnectionRef | null)[];

  const make = (encryptor: Encryptor = enc) =>
    new ConnectionManager(
      new ConnectionStore(path.join(dir, 'connections.json')),
      new SecretStore(path.join(dir, 'secrets.json'), encryptor),
      db
    );

  beforeAll(() => {
    fixtureA = createSqliteFixture('sqlsensi-mgr-a-');
    fixtureB = createSqliteFixture('sqlsensi-mgr-b-');
  });

  afterAll(() => {
    fixtureA.cleanup();
    fixtureB.cleanup();
  });

  beforeEach(() => {
    dir = tempDir('sqlsensi-mgr-');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (DatabaseService as any).instance = undefined;
    db = DatabaseService.getInstance();
    enc = fakeEncryptor();
    manager = make();
    events = [];
    manager.onActiveChange(a => events.push(a));
  });

  afterEach(async () => {
    await db.disconnect();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('opens a SQLite file, saves it as a profile and makes it active', async () => {
    const res = await manager.connectFile(fixtureA.dbPath);
    expect(res.success).toBe(true);
    if (!res.success) return;

    expect(res.data.active).toMatchObject({ engine: 'sqlite', label: 'sales_fixture.db' });
    expect(res.data.validation.valid).toBe(true);
    expect(manager.getActive()).toEqual(res.data.active);
    expect(manager.listProfiles()).toHaveLength(1);
    expect(events).toEqual([res.data.active]);
  });

  it('reuses the profile when the same file is opened again', async () => {
    const first = await manager.connectFile(fixtureA.dbPath);
    const variant = process.platform === 'win32' ? fixtureA.dbPath.toUpperCase() : fixtureA.dbPath;
    const second = await manager.connectFile(variant);
    expect(first.success && second.success).toBe(true);
    if (first.success && second.success) {
      expect(second.data.active.connectionId).toBe(first.data.active.connectionId);
    }
    expect(manager.listProfiles()).toHaveLength(1);
  });

  it('does not save a profile for a file that fails to open', async () => {
    const res = await manager.connectFile(path.join(dir, 'missing.db'));
    expect(res.success).toBe(false);
    expect(manager.listProfiles()).toEqual([]);
    expect(manager.getActive()).toBeNull();
  });

  it('rejects requests prepared for another connection after a switch', async () => {
    const a = await manager.connectFile(fixtureA.dbPath);
    if (!a.success) throw new Error('connect A failed');
    const idA = a.data.active.connectionId;
    expect(manager.assertActive(idA).success).toBe(true);

    const b = await manager.connectFile(fixtureB.dbPath);
    if (!b.success) throw new Error('connect B failed');

    const stale = manager.assertActive(idA);
    expect(stale.success).toBe(false);
    if (!stale.success) expect(stale.error.code).toBe('CONNECTION_CHANGED');
    expect(manager.assertActive(b.data.active.connectionId).success).toBe(true);
    expect(events.map(e => e?.connectionId)).toEqual([idA, b.data.active.connectionId]);
  });

  it('rejects requests without a connection id or when nothing is connected', async () => {
    expect(manager.assertActive('anything').success).toBe(false);
    await manager.connectFile(fixtureA.dbPath);
    const missing = manager.assertActive(undefined);
    expect(!missing.success && missing.error.code).toBe('CONNECTION_CHANGED');
  });

  it('keeps the current connection when switching fails', async () => {
    const a = await manager.connectFile(fixtureA.dbPath);
    if (!a.success) throw new Error('connect A failed');
    const res = await manager.connectFile(path.join(dir, 'missing.db'));
    expect(res.success).toBe(false);
    expect(manager.getActive()?.connectionId).toBe(a.data.active.connectionId);
  });

  it('notices when the database connection went away', async () => {
    await manager.connectFile(fixtureA.dbPath);
    await db.disconnect(); // e.g. a server dropped the connection
    expect(manager.getActive()).toBeNull();
    expect(events[events.length - 1]).toBeNull();
  });

  it('disconnects and reports no active connection', async () => {
    await manager.connectFile(fixtureA.dbPath);
    await manager.disconnect();
    expect(manager.getActive()).toBeNull();
    expect(db.isConnected()).toBe(false);
  });

  it('saves server profiles with an encrypted password and never returns it', () => {
    const res = manager.saveProfile(serverInput());
    expect(res.success).toBe(true);
    if (!res.success) return;

    expect(res.data.hasSavedPassword).toBe(true);
    const listed = JSON.stringify(manager.listProfiles());
    expect(listed).not.toContain(PASSWORD);
    expect(fs.readFileSync(path.join(dir, 'connections.json'), 'utf-8')).not.toContain(PASSWORD);
    expect(fs.readFileSync(path.join(dir, 'secrets.json'), 'utf-8')).not.toContain(PASSWORD);
  });

  it('keeps, replaces or forgets the saved password as asked', () => {
    const saved = manager.saveProfile(serverInput());
    if (!saved.success) throw new Error('save failed');
    const id = saved.data.id;

    const kept = manager.saveProfile({ ...serverInput({ password: undefined }), id, label: 'renamed' });
    expect(kept.success && kept.data).toMatchObject({ label: 'renamed', hasSavedPassword: true });

    const forgotten = manager.saveProfile({ ...serverInput({ savePassword: false }), id });
    expect(forgotten.success && forgotten.data.hasSavedPassword).toBe(false);
  });

  it('saves the profile but not the password when secure storage is unavailable', () => {
    const noSecrets = make(fakeEncryptor(false));
    expect(noSecrets.isSecretStorageAvailable()).toBe(false);
    const res = noSecrets.saveProfile(serverInput());
    expect(res.success && res.data.hasSavedPassword).toBe(false);
    expect(fs.existsSync(path.join(dir, 'secrets.json'))).toBe(false);
  });

  it('asks for the password when a server profile has none saved', async () => {
    const saved = manager.saveProfile(serverInput({ savePassword: false }));
    if (!saved.success) throw new Error('save failed');
    const res = await manager.connect(saved.data.id);
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe('PASSWORD_REQUIRED');
  });

  it('refuses to update a profile that does not exist', () => {
    const res = manager.saveProfile({ ...serverInput(), id: 'no-such-id' });
    expect(res.success).toBe(false);
  });

  it('tests a connection without changing the active one', async () => {
    const a = await manager.connectFile(fixtureA.dbPath);
    if (!a.success) throw new Error('connect A failed');

    const res = await manager.testConnection({ input: { engine: 'sqlite', label: 'b', filePath: fixtureB.dbPath } });
    expect(res.success && res.data).toEqual({ label: 'sales_fixture.db', tableCount: 3 });
    expect(manager.getActive()?.connectionId).toBe(a.data.active.connectionId);
    expect(db.getActivePath()).toBe(fixtureA.dbPath);
  });

  it('deleting the active profile disconnects it and removes its password', async () => {
    const a = await manager.connectFile(fixtureA.dbPath);
    if (!a.success) throw new Error('connect A failed');
    const res = await manager.deleteProfile(a.data.active.connectionId);
    expect(res.success).toBe(true);
    expect(manager.getActive()).toBeNull();
    expect(manager.listProfiles()).toEqual([]);
  });

  it('lists the most recently used profiles first', async () => {
    await manager.connectFile(fixtureA.dbPath);
    await new Promise(r => setTimeout(r, 5));
    await manager.connectFile(fixtureB.dbPath);
    const [first, second] = manager.listProfiles();
    expect(first.filePath).toBe(fixtureB.dbPath);
    expect(second.filePath).toBe(fixtureA.dbPath);
  });
});
