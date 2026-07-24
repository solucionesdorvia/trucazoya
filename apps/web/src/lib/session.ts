/**
 * Sesiones server-side. El token viaja en una cookie httpOnly/SameSite=Lax y
 * en la base sólo se guarda su HASH (si se filtra la DB, los tokens no sirven).
 */

import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { prisma } from '@trucazo/db';
import type { Role } from '@trucazo/shared';

const COOKIE = 'trucazo_session';
const DURATION_DAYS = 30;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface SessionUser {
  id: string;
  username: string;
  role: Role;
  displayName: string;
  isGuest: boolean;
  emailVerified: boolean;
  balance: number;
}

/** Crea una sesión y setea la cookie. Devuelve el token en claro (sólo acá). */
export async function createSession(userId: string, meta?: { ip?: string; ua?: string }) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + DURATION_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: { userId, tokenHash: hashToken(token), expiresAt, ip: meta?.ip, userAgent: meta?.ua },
  });

  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });

  return token;
}

/** Devuelve el usuario de la sesión actual, o null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { profile: true, wallet: true } } },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  if (session.user.suspended) return null;

  return {
    id: session.user.id,
    username: session.user.username,
    role: session.user.role,
    displayName: session.user.profile?.displayName ?? session.user.username,
    isGuest: session.user.isGuest,
    emailVerified: session.user.emailVerified,
    balance: Number(session.user.wallet?.balance ?? 0n),
  };
}

/** Cierra la sesión actual (revoca en DB y borra la cookie). */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) {
    await prisma.session
      .updateMany({ where: { tokenHash: hashToken(token) }, data: { revokedAt: new Date() } })
      .catch(() => undefined);
  }
  store.delete(COOKIE);
}

/** Igual que getSessionUser pero lanza si no hay sesión (para rutas privadas). */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error('UNAUTHORIZED');
  return user;
}
