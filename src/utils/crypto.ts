/**
 * Cryptographic Password Hashing & Security Utilities — SQL Sensi
 *
 * Uses built-in `node:crypto` with `scrypt` for memory-hard password hashing
 * and `crypto.timingSafeEqual` to prevent side-channel timing attacks.
 *
 * Specifications (AUTH_DESIGN.md §3.1):
 * - Key length: 64 bytes (512 bits)
 * - Salt: 16 bytes random salt via `crypto.randomBytes(16)`
 * - Cost parameters: N=16384, r=8, p=1
 */

import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 64; // 64 bytes key output
const SALT_LENGTH = 16; // 16 bytes salt
const SCRYPT_OPTIONS = {
  N: 16384,
  r: 8,
  p: 1,
};

export interface HashedPassword {
  hash: string; // Hex string (128 chars)
  salt: string; // Hex string (32 chars)
}

/**
 * Generates a cryptographically random salt and computes scrypt hash.
 *
 * @param password Raw plaintext password
 * @returns HashedPassword object with hash and salt hex strings
 */
export function hashPassword(password: string): HashedPassword {
  const saltBuf = randomBytes(SALT_LENGTH);
  const hashBuf = scryptSync(password, saltBuf, KEY_LENGTH, SCRYPT_OPTIONS);

  return {
    hash: hashBuf.toString('hex'),
    salt: saltBuf.toString('hex'),
  };
}

/**
 * Computes scrypt hash for candidate password using stored salt and compares
 * in constant-time using timingSafeEqual to protect against timing side-channel attacks.
 *
 * @param password Candidate plaintext password
 * @param storedHash Stored hash hex string
 * @param storedSalt Stored salt hex string
 * @returns True if password matches hash; false otherwise
 */
export function verifyPassword(
  password: string,
  storedHash: string,
  storedSalt: string
): boolean {
  try {
    const saltBuf = Buffer.from(storedSalt, 'hex');
    const storedHashBuf = Buffer.from(storedHash, 'hex');

    if (saltBuf.length !== SALT_LENGTH || storedHashBuf.length !== KEY_LENGTH) {
      return false;
    }

    const candidateHashBuf = scryptSync(
      password,
      saltBuf,
      KEY_LENGTH,
      SCRYPT_OPTIONS
    );

    return timingSafeEqual(storedHashBuf, candidateHashBuf);
  } catch {
    return false;
  }
}

/**
 * Generates a cryptographically secure 256-bit random token string for sessions.
 */
export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}
