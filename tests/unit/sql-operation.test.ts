import {
  classifySqlOperation,
  hasWhereClause,
  isBroadMutation,
  stripSqlNoise,
  extractTargetTable,
  isWriteOperation,
} from '../../src/utils/sql-operation';

describe('create operation helpers', () => {
  it('treats create as a write operation', () => {
    expect(isWriteOperation('create')).toBe(true);
    expect(isWriteOperation('ddl')).toBe(false);
  });

  it('extracts the target table of a CREATE for the audit log', () => {
    expect(extractTargetTable('CREATE TABLE Doctor (id INT)', 'create')).toBe('Doctor');
    expect(extractTargetTable('CREATE TABLE IF NOT EXISTS "Patient" (id INT)', 'create')).toBe('Patient');
    expect(extractTargetTable('CREATE INDEX idx_appt_doctor ON Appointment (DoctorId)', 'create')).toBe('Appointment');
    expect(extractTargetTable('CREATE VIEW active_doctors AS SELECT 1', 'create')).toBe('active_doctors');
  });
});

describe('classifySqlOperation', () => {
  it('classifies reads', () => {
    expect(classifySqlOperation('SELECT * FROM users')).toBe('read');
    expect(classifySqlOperation('  explain SELECT 1')).toBe('read');
    expect(classifySqlOperation('PRAGMA table_info(users)')).toBe('read');
  });

  it('classifies the three write operations', () => {
    expect(classifySqlOperation('INSERT INTO t (a) VALUES (1)')).toBe('insert');
    expect(classifySqlOperation('update t set a = 1 where id = 2')).toBe('update');
    expect(classifySqlOperation('DELETE FROM t WHERE id = 2')).toBe('delete');
  });

  it('classifies schema/destructive statements as ddl', () => {
    expect(classifySqlOperation('DROP TABLE t')).toBe('ddl');
    expect(classifySqlOperation('ALTER TABLE t ADD COLUMN c INT')).toBe('ddl');
    expect(classifySqlOperation('TRUNCATE TABLE t')).toBe('ddl');
    expect(classifySqlOperation('CREATE TRIGGER trg AFTER INSERT ON t BEGIN SELECT 1; END')).toBe('other'); // multi-statement body
    expect(classifySqlOperation('CREATE VIRTUAL TABLE v USING fts5(body)')).toBe('ddl');
    expect(classifySqlOperation('CREATE DATABASE shop')).toBe('ddl');
    expect(classifySqlOperation('CREATE TABLESPACE ts')).toBe('ddl');
  });

  it('classifies additive CREATE TABLE / INDEX / VIEW as create', () => {
    expect(classifySqlOperation('CREATE TABLE t (id INT)')).toBe('create');
    expect(classifySqlOperation('create table if not exists t (id int)')).toBe('create');
    expect(classifySqlOperation('CREATE TEMP TABLE t (id INT)')).toBe('create');
    expect(classifySqlOperation('CREATE INDEX idx_t ON t (id)')).toBe('create');
    expect(classifySqlOperation('CREATE UNIQUE INDEX idx_t ON t (id)')).toBe('create');
    expect(classifySqlOperation('CREATE VIEW v AS SELECT * FROM t')).toBe('create');
    expect(classifySqlOperation('CREATE TABLE t (id INT); DROP TABLE x')).toBe('other'); // multi-statement
  });

  it('refuses ambiguous or unsupported statements as other', () => {
    expect(classifySqlOperation('')).toBe('other');
    expect(classifySqlOperation('REPLACE INTO t VALUES (1)')).toBe('other');
    expect(classifySqlOperation('MERGE INTO t USING s ON (1=1)')).toBe('other');
    expect(classifySqlOperation('SELECT 1; DROP TABLE t')).toBe('other'); // multi-statement
  });

  it('is not fooled by keywords inside comments or string literals', () => {
    expect(classifySqlOperation('-- DELETE everything\nSELECT 1')).toBe('read');
    expect(classifySqlOperation("SELECT 'DELETE FROM x' AS note")).toBe('read');
    expect(classifySqlOperation('/* UPDATE */ SELECT 1')).toBe('read');
  });

  it('treats a read-only CTE as read but a data-modifying CTE as other', () => {
    expect(classifySqlOperation('WITH c AS (SELECT 1) SELECT * FROM c')).toBe('read');
    expect(classifySqlOperation('WITH c AS (SELECT 1) DELETE FROM t WHERE id IN (SELECT * FROM c)')).toBe('other');
  });
});

describe('hasWhereClause / isBroadMutation', () => {
  it('detects a real WHERE clause', () => {
    expect(hasWhereClause('DELETE FROM t WHERE id = 1')).toBe(true);
    expect(hasWhereClause('DELETE FROM t')).toBe(false);
  });

  it('does not treat a quoted identifier named "where" as a clause', () => {
    expect(hasWhereClause('SELECT "where" FROM t')).toBe(false);
  });

  it('flags UPDATE/DELETE without a WHERE as broad', () => {
    expect(isBroadMutation('DELETE FROM t', 'delete')).toBe(true);
    expect(isBroadMutation('UPDATE t SET a = 1', 'update')).toBe(true);
    expect(isBroadMutation('DELETE FROM t WHERE id = 1', 'delete')).toBe(false);
    expect(isBroadMutation('INSERT INTO t VALUES (1)', 'insert')).toBe(false);
  });
});

describe('stripSqlNoise', () => {
  it('removes comments and literals', () => {
    expect(stripSqlNoise("SELECT 'x' -- c\n, 1").includes("'x'")).toBe(false);
    expect(stripSqlNoise('a /* b */ c').includes('b')).toBe(false);
  });
});
