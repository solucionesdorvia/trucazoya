/**
 * Verificación de email por token de un solo uso.
 *
 * En la base sólo se guarda el HASH del token. El email se "envía" logueando el
 * link en consola en dev; en producción se enchufa un SMTP real acá (un solo
 * lugar). Esto desbloquea los retiros, que exigen email verificado.
 */

import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@trucazo/db';

const DURACION_HORAS = 24;

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Crea un token de verificación y "envía" el link. Devuelve el link en dev. */
export async function enviarVerificacion(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.email || user.emailVerified) return null;

  const token = randomBytes(32).toString('hex');
  await prisma.verificationToken.create({
    data: {
      userId,
      tokenHash: hash(token),
      purpose: 'EMAIL_VERIFY',
      expiresAt: new Date(Date.now() + DURACION_HORAS * 60 * 60 * 1000),
    },
  });

  const base = process.env.WEB_URL ?? 'http://localhost:3000';
  const link = `${base}/verificar?token=${token}`;

  // TODO producción: enviar por SMTP (nodemailer). En dev, a consola.
  if (!process.env.SMTP_HOST) {
    console.log(`\n📧 [verificación] ${user.email}: ${link}\n`);
  }
  return process.env.NODE_ENV === 'production' ? null : link;
}

/** Consume un token válido y marca el email como verificado. */
export async function verificarEmail(token: string): Promise<{ ok: boolean; error?: string }> {
  const registro = await prisma.verificationToken.findUnique({
    where: { tokenHash: hash(token) },
  });
  if (!registro || registro.purpose !== 'EMAIL_VERIFY') {
    return { ok: false, error: 'Link inválido' };
  }
  if (registro.usedAt) return { ok: false, error: 'Ese link ya se usó' };
  if (registro.expiresAt < new Date()) return { ok: false, error: 'El link venció' };

  await prisma.$transaction([
    prisma.user.update({ where: { id: registro.userId }, data: { emailVerified: true } }),
    prisma.verificationToken.update({ where: { id: registro.id }, data: { usedAt: new Date() } }),
  ]);
  return { ok: true };
}
