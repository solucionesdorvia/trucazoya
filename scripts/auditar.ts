/** Audita el ledger de todas las cuentas. Sólo lectura. */
import { prisma } from '@trucazo/db';
import { auditarUsuario } from '@trucazo/economia';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? '';
  const host = url.replace(/^.*@/, '').replace(/\/.*$/, '');
  console.log(`base: ${host}\n`);

  const users = await prisma.user.findMany({
    include: { wallet: true },
    orderBy: { createdAt: 'asc' },
  });
  for (const u of users) {
    const suma = await prisma.ledgerEntry.aggregate({
      where: { userId: u.id },
      _sum: { amount: true },
    });
    const saldo = u.wallet?.balance ?? 0n;
    const ledger = suma._sum.amount ?? 0n;
    const a = await auditarUsuario(u.id);
    const marca = a.ok ? 'cuadra ✓' : 'NO CUADRA ✗';
    console.log(
      `  ${u.username.padEnd(14)} saldo ${String(saldo).padStart(7)} · ledger ${String(ledger).padStart(7)} · ${marca}`,
    );
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
