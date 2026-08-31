/** Lista cuentas y saldos. Sólo lectura. */
import { prisma } from '@trucazo/db';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? '';
  const host = url.replace(/^.*@/, '').replace(/\/.*$/, '') || '(sin DATABASE_URL)';
  console.log(
    `base: ${host}${/localhost|127\.0\.0\.1/.test(host) ? '  (local)' : '  ← PRODUCCIÓN'}\n`,
  );

  const users = await prisma.user.findMany({
    include: { wallet: true, _count: { select: { ledgerEntries: true } } },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`total de cuentas: ${users.length}\n`);
  for (const u of users) {
    console.log(
      `  ${u.username.padEnd(22)} ${String(u.wallet?.balance ?? 0n).padStart(10)} fichas` +
        `  · rol ${u.role}  · ${u._count.ledgerEntries} mov.  · alta ${u.createdAt.toISOString().slice(0, 10)}`,
    );
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
