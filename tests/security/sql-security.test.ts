import { DatabaseSync } from 'node:sqlite';
import * as fs from 'fs';
import * as path from 'path';
import { databaseService } from '../../src/services/database/database.service';

const TEST_DB_PATH = path.join(__dirname, 'test-security.db');

describe('DatabaseService Security Tests', () => {
  beforeAll(async () => {
    // Create a temporary valid sqlite database
    const db = new DatabaseSync(TEST_DB_PATH);
    db.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
      INSERT INTO users (name) VALUES ('Alice'), ('Bob');
    `);
    db.close();

    await databaseService.connect(TEST_DB_PATH);
  });

  afterAll(() => {
    databaseService.disconnect();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  test('Should allow SELECT queries', () => {
    const result = databaseService.executeQuery('SELECT * FROM users;');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rowCount).toBe(2);
    }
  });

  test('Should block DROP TABLE', () => {
    const result = databaseService.executeQuery('DROP TABLE users;');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('SQL_VALIDATION_ERROR');
    }
  });

  test('Should block DELETE', () => {
    const result = databaseService.executeQuery("DELETE FROM users WHERE name = 'Alice';");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('SQL_VALIDATION_ERROR');
    }
  });

  test('Should block UPDATE', () => {
    const result = databaseService.executeQuery("UPDATE users SET name = 'Eve';");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('SQL_VALIDATION_ERROR');
    }
  });

  test('Should block INSERT', () => {
    const result = databaseService.executeQuery("INSERT INTO users (name) VALUES ('Charlie');");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('SQL_VALIDATION_ERROR');
    }
  });
});
