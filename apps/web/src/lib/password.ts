/**
 * Hashing de contraseñas con scrypt (Node crypto, sin dependencias externas).
 * Formato almacenado: "salt:hash" en hex.
 */

import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

const KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = await scryptAsync(password, salt, KEYLEN);
  return `${salt}:${derived.toString('hex')}`;
}

/**
 * Verifica una contraseña. Usa comparación en tiempo constante para no filtrar
 * información por timing. Devuelve false ante cualquier formato inválido.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const derived = await scryptAsync(password, salt, KEYLEN);
  const expected = Buffer.from(hash, 'hex');
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(derived, expected);
}
