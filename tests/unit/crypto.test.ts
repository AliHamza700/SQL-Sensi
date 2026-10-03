import { hashPassword, verifyPassword, generateSessionToken } from '../../src/utils/crypto';

describe('Crypto Password Hashing Utility', () => {
  it('should generate a 64-byte hex hash and 16-byte hex salt', () => {
    const { hash, salt } = hashPassword('SecretPass123');

    expect(hash).toHaveLength(128); // 64 bytes in hex
    expect(salt).toHaveLength(32);  // 16 bytes in hex
  });

  it('should verify correct password against stored hash and salt', () => {
    const password = 'StrongPassword89!';
    const { hash, salt } = hashPassword(password);

    const isValid = verifyPassword(password, hash, salt);
    expect(isValid).toBe(true);
  });

  it('should reject incorrect password', () => {
    const { hash, salt } = hashPassword('CorrectPassword123');

    const isValid = verifyPassword('WrongPassword123', hash, salt);
    expect(isValid).toBe(false);
  });

  it('should generate unique salts for identical passwords', () => {
    const pass = 'IdenticalPassword123';
    const res1 = hashPassword(pass);
    const res2 = hashPassword(pass);

    expect(res1.salt).not.toBe(res2.salt);
    expect(res1.hash).not.toBe(res2.hash);
    expect(verifyPassword(pass, res1.hash, res1.salt)).toBe(true);
    expect(verifyPassword(pass, res2.hash, res2.salt)).toBe(true);
  });

  it('should generate 256-bit (64 hex chars) session tokens', () => {
    const token1 = generateSessionToken();
    const token2 = generateSessionToken();

    expect(token1).toHaveLength(64);
    expect(token2).toHaveLength(64);
    expect(token1).not.toBe(token2);
  });
});
