import fs from 'fs';
import path from 'path';
import os from 'os';
import { DatabaseSync } from 'node:sqlite';
import { databaseService } from '../../src/services/database/database.service';
import { schemaService } from '../../src/services/schema/schema.service';

describe('SchemaService (Phase 4)', () => {
  let tempDir: string;
  let dbPath: string;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlsensi-schema-'));
    dbPath = path.join(tempDir, 'schema_test.db');

    // Create a complex SQLite database for testing schema extraction
    const db = new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        status TEXT DEFAULT 'active'
      );

      CREATE TABLE posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        content TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX idx_posts_user_id ON posts(user_id);
      CREATE UNIQUE INDEX idx_users_email ON users(email);

      CREATE VIEW active_users AS 
      SELECT id, email FROM users WHERE status = 'active';
    `);
    
    // Insert dummy data to test rowCount
    const insertUser = db.prepare("INSERT INTO users (email) VALUES (?)");
    insertUser.run('test1@example.com');
    insertUser.run('test2@example.com');
    
    const insertPost = db.prepare("INSERT INTO posts (user_id, title, content) VALUES (?, ?, ?)");
    insertPost.run(1, 'Hello World', 'This is a test post');

    db.close();
  });

  afterAll(() => {
    databaseService.disconnect();
    setTimeout(() => {
      try { if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath); } catch {}
      try { fs.rmdirSync(tempDir); } catch {}
    }, 100);
  });

  beforeEach(async () => {
    // Ensure the database is connected before testing schema
    await databaseService.connect(dbPath);
  });

  it('should return error if no database is connected', async () => {
    databaseService.disconnect();
    const result = await schemaService.extractSchema();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('DATABASE_ERROR');
    }
  });

  it('should extract the full database schema accurately', async () => {
    const result = await schemaService.extractSchema();
    expect(result.success).toBe(true);
    
    if (result.success) {
      const schema = result.data;
      
      expect(schema.databaseName).toBe('schema_test.db');
      expect(schema.tables.length).toBe(2);
      expect(schema.views.length).toBe(1);
      
      // Check Tables
      const usersTable = schema.tables.find(t => t.name === 'users');
      expect(usersTable).toBeDefined();
      expect(usersTable?.rowCount).toBe(2);
      expect(usersTable?.primaryKeys).toEqual(['id']);
      
      // Check Columns for users table
      const emailCol = usersTable?.columns.find(c => c.name === 'email');
      expect(emailCol).toBeDefined();
      expect(emailCol?.type).toBe('TEXT');
      expect(emailCol?.nullable).toBe(false); // NOT NULL
      
      const statusCol = usersTable?.columns.find(c => c.name === 'status');
      expect(statusCol?.defaultValue).toBe("'active'");

      // Check posts table
      const postsTable = schema.tables.find(t => t.name === 'posts');
      expect(postsTable).toBeDefined();
      expect(postsTable?.rowCount).toBe(1);
      expect(postsTable?.primaryKeys).toEqual(['id']);
      
      // Check Foreign Keys inside TableSchema
      expect(postsTable?.foreignKeys.length).toBe(1);
      expect(postsTable?.foreignKeys[0].columnName).toBe('user_id');
      expect(postsTable?.foreignKeys[0].referencedTable).toBe('users');
      expect(postsTable?.foreignKeys[0].referencedColumn).toBe('id');

      // Check Global Relationships
      expect(schema.relationships.length).toBe(1);
      expect(schema.relationships[0].fromTable).toBe('posts');
      expect(schema.relationships[0].fromColumn).toBe('user_id');
      expect(schema.relationships[0].toTable).toBe('users');
      expect(schema.relationships[0].toColumn).toBe('id');

      // Check Indexes
      expect(schema.indexes.length).toBeGreaterThanOrEqual(2);
      const postUserIdx = schema.indexes.find(i => i.name === 'idx_posts_user_id');
      expect(postUserIdx).toBeDefined();
      expect(postUserIdx?.tableName).toBe('posts');
      expect(postUserIdx?.columns).toEqual(['user_id']);
      expect(postUserIdx?.unique).toBe(false);

      // Check Views
      const activeUsersView = schema.views.find(v => v.name === 'active_users');
      expect(activeUsersView).toBeDefined();
      expect(activeUsersView?.sql).toContain('SELECT id, email FROM users');
    }
  });
});
