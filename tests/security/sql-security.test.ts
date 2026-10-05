import { sqlSecurityService } from '../../src/services/security/sql-security.service';

describe('SqlSecurityService (Phase 8)', () => {
  describe('Safe Queries', () => {
    it('should allow a standard SELECT query', () => {
      const sql = 'SELECT * FROM users WHERE status = "active";';
      const result = sqlSecurityService.validateQuery(sql);
      expect(result.success).toBe(true);
    });

    it('should allow queries with JOIN and GROUP BY', () => {
      const sql = `
        SELECT u.name, COUNT(p.id) 
        FROM users u 
        JOIN posts p ON u.id = p.user_id 
        GROUP BY u.name;
      `;
      const result = sqlSecurityService.validateQuery(sql);
      expect(result.success).toBe(true);
    });

    it('should allow CTEs (WITH clauses)', () => {
      const sql = `
        WITH ActiveUsers AS (SELECT * FROM users WHERE active = 1)
        SELECT * FROM ActiveUsers;
      `;
      const result = sqlSecurityService.validateQuery(sql);
      expect(result.success).toBe(true);
    });

    it('should allow EXPLAIN queries', () => {
      const sql = 'EXPLAIN QUERY PLAN SELECT * FROM users;';
      const result = sqlSecurityService.validateQuery(sql);
      expect(result.success).toBe(true);
    });
  });

  describe('Unsafe Queries', () => {
    it('should reject queries not starting with SELECT/WITH/EXPLAIN', () => {
      const sql = 'SHOW TABLES;'; // Even though safe, our strict policy blocks it
      const result = sqlSecurityService.validateQuery(sql);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('SQL_VALIDATION_ERROR');
      }
    });

    it('should reject INSERT statements embedded in the query', () => {
      // Even if starts with SELECT, if it contains INSERT it should fail
      const sql = 'SELECT * FROM users; INSERT INTO users (name) VALUES ("hacker");';
      const result = sqlSecurityService.validateQuery(sql);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('SQL_VALIDATION_ERROR');
        expect(result.error.message).toContain('INSERT');
      }
    });

    it('should reject DROP TABLE', () => {
      const sql = 'SELECT 1; DROP TABLE users;';
      const result = sqlSecurityService.validateQuery(sql);
      expect(result.success).toBe(false);
    });

    it('should reject PRAGMA execution', () => {
      const sql = 'SELECT * FROM (PRAGMA database_list);';
      const result = sqlSecurityService.validateQuery(sql);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('PRAGMA');
      }
    });

    it('should reject UPDATE', () => {
      const sql = 'SELECT * FROM users; UPDATE users SET role = "admin";';
      const result = sqlSecurityService.validateQuery(sql);
      expect(result.success).toBe(false);
    });
  });
});
