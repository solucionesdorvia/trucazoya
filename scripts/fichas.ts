/**
 * Acredita (o descuenta) fichas a una cuenta, para probar.
 *
 *   pnpm fichas pepe 5000      → le suma 5000
 *   pnpm fichas toto -1200     → le descuenta 1200
 *   pnpm fichas pepe           → sólo muestra el saldo
 *
 * Pasa por el ledger igual que cualquier otro movimiento, así que el saldo
 * queda con respaldo contable y la auditoría sigue cuadrando. Para la carga
 * de verdad está el panel del cajero; esto es el atajo para testear.
 */

import { prisma } from '@trucazo/db';
import { auditarUsuario, registrarMovimiento } from '@trucazo/economia';

async function main(): Promise<void> {
  const [usuario, montoTexto] = process.argv.slice(2);

  if (!usuario) {
    console.error('Uso: pnpm fichas <usuario> [monto]   (monto negativo descuenta)');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { username: usuario },
    include: { wallet: true },
  });

  if (!user) {
    console.error(`No existe el usuario "${usuario}".`);
    process.exit(1);
  }

  const saldoActual = user.wallet?.balance ?? 0n;

  if (montoTexto === undefined) {
    console.log(`${usuario}: ${saldoActual.toLocaleString('es-AR')} fichas`);
    await prisma.$disconnect();
    process.exit(0);
  }

  const monto = Number(montoTexto);
  if (!Number.isInteger(monto) || monto === 0) {
    console.error('El monto tiene que ser un número entero distinto de cero.');
    process.exit(1);
  }
  if (saldoActual + BigInt(monto) < 0n) {
    console.error(
      `No se puede: ${usuario} tiene ${saldoActual} y quedaría en ${saldoActual + BigInt(monto)}.`,
    );
    process.exit(1);
  }

  await registrarMovimiento({
    userId: user.id,
    type: 'ADMIN_ADJUSTMENT',
    amount: BigInt(monto),
    idempotencyKey: `cli:${user.id}:${Date.now()}`,
    reason: 'Ajuste manual para pruebas',
  });

  const despues = await prisma.wallet.findUnique({ where: { userId: user.id } });
  const auditoria = await auditarUsuario(user.id);

  console.log(
    `${usuario}: ${saldoActual.toLocaleString('es-AR')} → ` +
      `${(despues?.balance ?? 0n).toLocaleString('es-AR')} fichas ` +
      `(${monto > 0 ? '+' : ''}${monto.toLocaleString('es-AR')})`,
  );
  console.log(`ledger: ${auditoria.ok ? 'cuadra ✓' : 'NO CUADRA ✗'}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
