/**
 * Repara las cuentas cuyo saldo no tiene respaldo en el ledger.
 *
 * El seed viejo escribía `balance` directo, sin asiento: la billetera decía
 * 500 y la contabilidad 0. Se inserta el asiento que falta, fechado ANTES de
 * los movimientos existentes para que la cadena before→after cierre.
 *
 * Con --aplicar escribe; sin el flag sólo muestra qué haría.
 */
import { prisma } from '@trucazo/db';
import { auditarUsuario } from '@trucazo/economia';

async function main(): Promise<void> {
  const aplicar = process.argv.includes('--aplicar');
  const host = (process.env.DATABASE_URL ?? '').replace(/^.*@/, '').replace(/\/.*$/, '');
  console.log(`base: ${host}   modo: ${aplicar ? 'APLICAR' : 'simulación'}\n`);

  const users = await prisma.user.findMany({ include: { wallet: true } });
  let tocadas = 0;

  for (const u of users) {
    const saldo = u.wallet?.balance ?? 0n;
    const suma = await prisma.ledgerEntry.aggregate({
      where: { userId: u.id },
      _sum: { amount: true },
    });
    const hueco = saldo - (suma._sum.amount ?? 0n);
    if (hueco === 0n) continue;

    const primero = await prisma.ledgerEntry.findFirst({
      where: { userId: u.id },
      orderBy: { createdAt: 'asc' },
    });
    const fecha = primero ? new Date(primero.createdAt.getTime() - 1000) : new Date();

    console.log(`  ${u.username.padEnd(14)} falta asiento por ${hueco}`);
    tocadas++;
    if (!aplicar) continue;

    await prisma.ledgerEntry.upsert({
      where: { userId_idempotencyKey: { userId: u.id, idempotencyKey: `respaldo-seed:${u.id}` } },
      update: {},
      create: {
        userId: u.id,
        type: 'ADMIN_ADJUSTMENT',
        amount: hueco,
        balanceBefore: 0n,
        balanceAfter: hueco,
        idempotencyKey: `respaldo-seed:${u.id}`,
        reason: 'Respaldo contable del saldo inicial (el seed no escribía asiento)',
        createdAt: fecha,
      },
    });
  }

  console.log(`\ncuentas ${aplicar ? 'reparadas' : 'a reparar'}: ${tocadas}`);
  if (aplicar) {
    console.log('\n── auditoría después ──');
    for (const u of await prisma.user.findMany({ orderBy: { createdAt: 'asc' } })) {
      const a = await auditarUsuario(u.id);
      console.log(`  ${u.username.padEnd(14)} ${a.ok ? 'cuadra ✓' : 'NO CUADRA ✗'}`);
    }
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
