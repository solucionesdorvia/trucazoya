/**
 * Token corto firmado (HMAC-SHA256) para autenticar el handshake del socket.
 *
 * La sesión web vive en una cookie httpOnly que el game-server (otro origen)
 * no puede leer. La web, que SÍ tiene la sesión, emite este token de vida
 * corta; el game-server sólo verifica la firma. No lleva secretos.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export interface ClaimsPartida {
  userId: string;
  username: string;
  /** Epoch en segundos. */
  exp: number;
}

function base64url(buf: Buffer | string): string {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function firmar(payload: string, secret: string): string {
  return base64url(createHmac('sha256', secret).update(payload).digest());
}

/** Emite un token válido por `segundos` (por defecto 5 minutos). */
export function emitirTokenPartida(
  claims: Omit<ClaimsPartida, 'exp'>,
  secret: string,
  segundos = 300,
): string {
  const full: ClaimsPartida = { ...claims, exp: Math.floor(Date.now() / 1000) + segundos };
  const payload = base64url(JSON.stringify(full));
  return `${payload}.${firmar(payload, secret)}`;
}

/**
 * Verifica firma y expiración. Devuelve null si el token es inválido.
 * La comparación de firmas es en tiempo constante.
 */
export function verificarTokenPartida(token: string, secret: string): ClaimsPartida | null {
  const partes = token.split('.');
  if (partes.length !== 2) return null;
  const [payload, firma] = partes as [string, string];

  const esperada = firmar(payload, secret);
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as ClaimsPartida;
    if (typeof claims.exp !== 'number' || claims.exp < Math.floor(Date.now() / 1000)) return null;
    if (!claims.userId || !claims.username) return null;
    return claims;
  } catch {
    return null;
  }
}

/** Código de sala de 6 caracteres, sin caracteres ambiguos (0/O, 1/I). */
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generarCodigoSala(randomInt: (max: number) => number): string {
  let code = '';
  for (let i = 0; i < 6; i++) code += ALFABETO[randomInt(ALFABETO.length)];
  return code;
}
