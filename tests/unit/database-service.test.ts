import fs from 'fs';
import path from 'path';
import os from 'os';
import { DatabaseSync } from 'node:sqlite';
import { DatabaseService } from '../../src/services/database/database.service';

describe('DatabaseService (Phase 3)', () => {
  let dbService: DatabaseService;
  let tempDir: string;
  let validDbPath: string;
  let invalidPath: string;
  let smallFilePath: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlsensi-test-'));
    validDbPath = path.join(tempDir, 'valid.db');
    invalidPath = path.join(tempDir, 'invalid.txt');
    smallFilePath = path.join(tempDir, 'small.db');

    // Create a real SQLite database
    const db = new DatabaseSync(validDbPath);
    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY);');
    db.close();

    // Create invalid text file (must be > 100 bytes)
    fs.writeFileSync(invalidPath, 'This is definitely not a database file of any sort. It is just a text file. '.repeat(10));

    // Create small file
    fs.writeFileSync(smallFilePath, 'Tiny');
  });

  afterAll(() => {
    // Cleanup
    dbService?.disconnect();
    if (fs.existsSync(validDbPath)) fs.unlinkSync(validDbPath);
    if (fs.existsSync(invalidPath)) fs.unlinkSync(invalidPath);
    if (fs.existsSync(smallFilePath)) fs.unlinkSync(smallFilePath);
    try { fs.rmdirSync(tempDir); } catch {}
  });

  beforeEach(() => {
    // We can't easily reset a singleton between tests if it's exported as a const,
    // but we can use the class directly to spawn a clean instance.
    // However, since it has a private constructor, we'll cast any to hack reset it for testing.
    (DatabaseService as any).instance = undefined;
    dbService = DatabaseService.getInstance();
  });

  it('should initialize completely disconnected', () => {
    expect(dbService.isConnected()).toBe(false);
    expect(dbService.getActivePath()).toBeNull();
    expect(() => dbService.getConnection()).toThrow('No database connected.');
  });

  it('should open a valid SQLite file and maintain state', async () => {
    const result = await dbService.connect(validDbPath);
    
    expect(result.success).toBe(true);
    expect(dbService.isConnected()).toBe(true);
    expect(dbService.getActivePath()).toBe(validDbPath);
    
    const conn = dbService.getConnection();
    expect(conn).toBeDefined();

    // Cleanly close
    dbService.disconnect();
    expect(dbService.isConnected()).toBe(false);
  });

  it('should reject invalid file extensions / corrupted databases', async () => {
    const result = await dbService.connect(invalidPath);
    
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_DATABASE');
      expect(result.error.message).toMatch(/magic string mismatch/i);
    }
    expect(dbService.isConnected()).toBe(false);
  });

  it('should reject databases smaller than 100 bytes', async () => {
    const result = await dbService.connect(smallFilePath);
    
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_DATABASE');
      expect(result.error.message).toMatch(/too small/i);
    }
    expect(dbService.isConnected()).toBe(false);
  });

  it('should reject nonexistent files', async () => {
    const result = await dbService.connect(path.join(tempDir, 'ghost.db'));
    
    expect(result.success).toBe(false);
    expect(dbService.isConnected()).toBe(false);
  });

  it('should close database cleanly and allow reconnecting', async () => {
    await dbService.connect(validDbPath);
    expect(dbService.isConnected()).toBe(true);

    dbService.disconnect();
    expect(dbService.isConnected()).toBe(false);
    expect(() => dbService.getConnection()).toThrow();

    // Reconnect
    const result = await dbService.connect(validDbPath);
    expect(result.success).toBe(true);
    expect(dbService.isConnected()).toBe(true);
  });
});
