/**
 * Supervisor PIN hashing with Node's built-in scrypt (no extra dependency). Format:
 * `scrypt$<saltHex>$<hashHex>`. PINs are never stored or logged in clear (NFR-14).
 */
import type { PinVerifier } from '../domain/repositories';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 32;

export function hashPin(pin: string, salt: Buffer = randomBytes(16)): string {
  return `scrypt$${salt.toString('hex')}$${scryptSync(pin, salt, KEY_LENGTH).toString('hex')}`;
}

/** Constant-time comparison of a PIN against a stored hash; false for malformed hashes. */
export function verifyPin(pin: string, stored: string | null): boolean {
  if (!stored) return false;
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(pin, Buffer.from(saltHex, 'hex'), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

const DECOY_HASH = hashPin('decoy', Buffer.alloc(16));

/** The scrypt-based verifier; spends the same effort whether or not a hash is on record. */
export const scryptPinVerifier: PinVerifier = {
  verify(pin, storedHash) {
    const ok = verifyPin(pin, storedHash ?? DECOY_HASH);
    return storedHash !== null && ok;
  },
};
