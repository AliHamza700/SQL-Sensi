import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { AuthService } from '../../src/services/auth/auth.service';

describe('AuthService — roles (V2 Phase 6)', () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlsensi-authrole-'));
    dbPath = path.join(dir, 'sensi_app.db');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('makes the first registered account an admin and the rest standard', async () => {
    const auth = new AuthService(dbPath);
    const first = await auth.register('admin@x.test', 'ValidPass123');
    const second = await auth.register('user@x.test', 'ValidPass123');
    auth.close();

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    if (first.success) expect(first.data.user.role).toBe('admin');
    if (second.success) expect(second.data.user.role).toBe('standard');
  });

  it('lists users and lets an admin promote and demote accounts', async () => {
    const auth = new AuthService(dbPath);
    await auth.register('admin@x.test', 'ValidPass123'); // first → admin
    const second = await auth.register('user@x.test', 'ValidPass123');
    if (!second.success) throw new Error('register failed');

    const list = await auth.listUsers();
    expect(list.success).toBe(true);
    if (list.success) expect(list.data).toHaveLength(2);

    // Promote the standard user to admin, then demote back.
    const promoted = await auth.setUserRole(second.data.user.id, 'admin');
    expect(promoted.success && promoted.data.role).toBe('admin');

    const demoted = await auth.setUserRole(second.data.user.id, 'standard');
    expect(demoted.success && demoted.data.role).toBe('standard');
    auth.close();
  });

  it('refuses to demote the only remaining administrator (no lockout)', async () => {
    const auth = new AuthService(dbPath);
    const first = await auth.register('solo-admin@x.test', 'ValidPass123');
    if (!first.success) throw new Error('register failed');

    const res = await auth.setUserRole(first.data.user.id, 'standard');
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe('NOT_AUTHORIZED');

    // Still an admin.
    const list = await auth.listUsers();
    expect(list.success && list.data[0].role).toBe('admin');
    auth.close();
  });

  it('reports the role on login and session validation', async () => {
    const auth = new AuthService(dbPath);
    await auth.register('admin@x.test', 'ValidPass123');
    const login = await auth.login('admin@x.test', 'ValidPass123');
    expect(login.success).toBe(true);
    if (login.success) {
      expect(login.data.user.role).toBe('admin');
      const validated = await auth.validateSession(login.data.session.token);
      expect(validated.success).toBe(true);
      if (validated.success) expect(validated.data.role).toBe('admin');
    }
    auth.close();
  });

  it('migrates a pre-V2 database: adds role, promotes the earliest account, bumps user_version', () => {
    // Build a legacy (V1) auth DB with NO role column and two users.
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_login_at TEXT
      );
    `);
    legacy.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,?)')
      .run('old-1', 'first@x.test', 'h', 's', '2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z', null);
    legacy.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,?)')
      .run('old-2', 'second@x.test', 'h', 's', '2021-01-01T00:00:00.000Z', '2021-01-01T00:00:00.000Z', null);
    legacy.exec('PRAGMA user_version = 0');
    legacy.close();

    // Opening through AuthService runs the migration.
    const auth = new AuthService(dbPath);
    auth.close();

    // Inspect the migrated DB directly.
    const db = new DatabaseSync(dbPath);
    const cols = (db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>).map((c) => c.name);
    expect(cols).toContain('role');

    const version = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
    expect(version).toBe(1);

    const first = db.prepare('SELECT role FROM users WHERE id = ?').get('old-1') as { role: string };
    const second = db.prepare('SELECT role FROM users WHERE id = ?').get('old-2') as { role: string };
    expect(first.role).toBe('admin'); // earliest created_at
    expect(second.role).toBe('standard');
    db.close();

    // A backup of the pre-migration DB was written.
    const backups = fs.readdirSync(dir).filter((f) => f.includes('backup-authv0-'));
    expect(backups.length).toBeGreaterThanOrEqual(1);
  });
});
