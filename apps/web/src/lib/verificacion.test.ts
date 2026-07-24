import { afterAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { prisma } from '@trucazo/db';
import { enviarVerificacion, verificarEmail } from './verificacion';

const sufijo = Date.now().toString(36);
const ids: string[] = [];

async function usuario(verificado = false) {
  const u = await prisma.user.create({
    data: {
      username: `verif_${sufijo}_${ids.length}`,
      email: `verif_${sufijo}_${ids.length}@t.local`,
      emailVerified: verificado,
      profile: { create: { displayName: 'Verif' } },
      wallet: { create: {} },
    },
  });
  ids.push(u.id);
  return u.id;
}

afterAll(async () => {
  await prisma.verificationToken.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

// Extrae el token del link que devuelve enviarVerificacion en dev.
function tokenDe(link: string): string {
  return new URL(link).searchParams.get('token')!;
}

describe('verificación de email', () => {
  it('verifica con un token válido y no se puede reusar', async () => {
    const id = await usuario();
    const link = await enviarVerificacion(id);
    expect(link).toBeTruthy();
    const token = tokenDe(link!);

    const r = await verificarEmail(token);
    expect(r.ok).toBe(true);
    const u = await prisma.user.findUnique({ where: { id } });
    expect(u?.emailVerified).toBe(true);

    // Reuso: el token ya está usado.
    const otra = await verificarEmail(token);
    expect(otra.ok).toBe(false);
  });

  it('rechaza un token inexistente', async () => {
    const r = await verificarEmail('token-que-no-existe');
    expect(r.ok).toBe(false);
  });

  it('en la base sólo se guarda el HASH del token', async () => {
    const id = await usuario();
    const link = await enviarVerificacion(id);
    const token = tokenDe(link!);
    // El token en claro NO debe estar en la base; sí su hash.
    const porClaro = await prisma.verificationToken.findUnique({ where: { tokenHash: token } });
    expect(porClaro).toBeNull();
    const porHash = await prisma.verificationToken.findUnique({
      where: { tokenHash: createHash('sha256').update(token).digest('hex') },
    });
    expect(porHash).toBeTruthy();
  });

  it('no manda verificación si el email ya está verificado', async () => {
    const id = await usuario(true);
    const link = await enviarVerificacion(id);
    expect(link).toBeNull();
  });
});
