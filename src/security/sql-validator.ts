/**
 * SQL Security Validator
 *
 * Architecture Rule (rules.md §5, §6):
 * - AI-generated SQL is UNTRUSTED — always validate before execution
 * - Only SELECT statements are allowed in MVP
 * - Destructive operations must be BLOCKED at this layer
 *
 * Phase 8 implementation.
 */
export {};
