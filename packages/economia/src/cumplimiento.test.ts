import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@trucazo/db';
import { enviarKyc, estadoKyc, provinciaPermitida, resolverKyc } from './cumplimiento.js';

const sufijo = Math.random().toString(36).slice(2, 8);
const ids: string[] = [];

async function usuario(nombre: string): Promise<string> {
  const u = await prisma.user.create({
    data: {
      username: `kyc_${nombre}_${sufijo}`,
      email: `kyc_${nombre}_${sufijo}@t.local`,
      profile: { create: { displayName: nombre } },
      wallet: { create: { balance: 0n } },
    },
  });
  ids.push(u.id);
  return u.id;
}

afterAll(async () => {
  await prisma.kycSubmission.deleteMany({ where: { userId: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.wallet.deleteMany({ where: { userId: { in: ids } } });
  await prisma.profile.deleteMany({ where: { userId: { in: ids } } });
  await prisma.systemSetting.deleteMany({ where: { key: 'jurisdiction' } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe('KYC', () => {
  it('flujo completo: envío pendiente → aprobado marca kycVerifiedAt', async () => {
    const jugador = await usuario('flow');
    const admin = await usuario('admin');

    expect(await estadoKyc(jugador)).toBe('NONE');

    const envio = await enviarKyc({
      userId: jugador,
      fullName: 'Juan Pérez',
      docType: 'DNI',
      docNumber: '30111222',
    });
    expect(envio.ok).toBe(true);
    expect(await estadoKyc(jugador)).toBe('PENDING');

    // No se puede enviar dos veces mientras hay uno pendiente.
    const dup = await enviarKyc({
      userId: jugador,
      fullName: 'Juan Pérez',
      docType: 'DNI',
      docNumber: '30111222',
    });
    expect(dup.ok).toBe(false);

    const sub = await prisma.kycSubmission.findFirst({ where: { userId: jugador } });
    const r = await resolverKyc({
      adminUserId: admin,
      submissionId: sub!.id,
      accion: 'APPROVED',
    });
    expect(r.ok).toBe(true);
    expect(await estadoKyc(jugador)).toBe('APPROVED');

    const u = await prisma.user.findUnique({ where: { id: jugador } });
    expect(u?.kycVerifiedAt).not.toBeNull();
  });

  it('rechazar deja el estado REJECTED y no verifica', async () => {
    const jugador = await usuario('rej');
    const admin = await usuario('admin2');
    await enviarKyc({ userId: jugador, fullName: 'X', docType: 'DNI', docNumber: '1' });
    const sub = await prisma.kycSubmission.findFirst({ where: { userId: jugador } });
    await resolverKyc({ adminUserId: admin, submissionId: sub!.id, accion: 'REJECTED' });
    expect(await estadoKyc(jugador)).toBe('REJECTED');
  });
});

describe('jurisdicción', () => {
  it('bloquea las provincias que el operador configura', async () => {
    expect(await provinciaPermitida('SF')).toBe(true); // sin config, todo permitido
    await prisma.systemSetting.upsert({
      where: { key: 'jurisdiction' },
      create: { key: 'jurisdiction', value: { bloqueadas: ['SF'] } },
      update: { value: { bloqueadas: ['SF'] } },
    });
    expect(await provinciaPermitida('SF')).toBe(false);
    expect(await provinciaPermitida('CABA')).toBe(true);
  });
});
