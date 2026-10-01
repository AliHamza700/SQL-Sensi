/**
 * Security Test Suite — SQL Validator
 *
 * Per rules.md §38, these security tests are mandatory.
 * Implement in Phase 8 when SQLValidator is built.
 *
 * Tests to cover:
 *   SELECT * FROM users;      → ALLOWED
 *   INSERT INTO ...           → BLOCKED
 *   UPDATE ...                → BLOCKED
 *   DELETE FROM ...           → BLOCKED
 *   DROP TABLE ...            → BLOCKED
 *   ALTER TABLE ...           → BLOCKED
 *   CREATE TABLE ...          → BLOCKED
 *   ATTACH DATABASE ...       → BLOCKED
 *   DETACH ...                → BLOCKED
 *   TRUNCATE ...              → BLOCKED
 */

// Placeholder — implement in Phase 8
describe('SQLValidator (Phase 8)', () => {
  it.todo('should allow SELECT statements');
  it.todo('should block INSERT statements');
  it.todo('should block UPDATE statements');
  it.todo('should block DELETE statements');
  it.todo('should block DROP statements');
  it.todo('should block ALTER statements');
  it.todo('should block CREATE statements');
  it.todo('should block ATTACH statements');
  it.todo('should block DETACH statements');
  it.todo('should revalidate after user edit');
  it.todo('should block multi-statement queries that bypass read-only policy');
});
