/**
 * Tests de integración contra la base real (Postgres de docker-compose).
 * Requiere `pnpm db:up` + migraciones aplicadas.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@trucazo/db';
import { autenticar, crearCuenta } from './cuentas';
import { hashPassword, verifyPassword } from './password';

const sufijo = `t${Date.now().toString(36)}`;
const usuario = `test_${sufijo}`;
const email = `${usuario}@test.local`;
const clave = 'unaClaveSegura123';
const creados: string[] = [];

afterAll(async () => {
  if (creados.length) {
    await prisma.user.deleteMany({ where: { id: { in: creados } } });
  }
  await prisma.$disconnect();
});

describe('hashing de contraseñas', () => {
  it('verifica la contraseña correcta y rechaza la incorrecta', async () => {
    const hash = await hashPassword(clave);
    expect(await verifyPassword(clave, hash)).toBe(true);
    expect(await verifyPassword('otraClave', hash)).toBe(false);
  });

  it('dos hashes de la misma clave son distintos (sal aleatoria)', async () => {
    expect(await hashPassword(clave)).not.toBe(await hashPassword(clave));
  });

  it('no explota con hashes malformados', async () => {
    expect(await verifyPassword(clave, 'basura')).toBe(false);
    expect(await verifyPassword(clave, '')).toBe(false);
  });
});

describe('crearCuenta', () => {
  it('crea usuario, perfil, billetera, ratings y el asiento del ledger', async () => {
    const res = await crearCuenta({ username: usuario, email, password: clave });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    creados.push(res.userId);

    const user = await prisma.user.findUnique({
      where: { id: res.userId },
      include: { profile: true, wallet: true, ratings: true, ledgerEntries: true },
    });

    expect(user?.profile?.displayName).toBe(usuario);
    expect(user?.wallet?.balance).toBe(500n);
    expect(user?.ratings).toHaveLength(2);

    // El saldo tiene respaldo contable: hay un asiento por las monedas de bienvenida.
    expect(user?.ledgerEntries).toHaveLength(1);
    const asiento = user!.ledgerEntries[0]!;
    expect(asiento.amount).toBe(500n);
    expect(asiento.balanceBefore).toBe(0n);
    expect(asiento.balanceAfter).toBe(500n);
    // Invariante del ledger: after = before + amount
    expect(asiento.balanceAfter).toBe(asiento.balanceBefore + asiento.amount);
  });

  it('rechaza username duplicado', async () => {
    const res = await crearCuenta({
      username: usuario,
      email: `otro_${sufijo}@t.local`,
      password: clave,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.campo).toBe('username');
  });

  it('rechaza email duplicado', async () => {
    const res = await crearCuenta({ username: `otro_${sufijo}`, email, password: clave });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.campo).toBe('email');
  });

  it('no guarda la contraseña en claro', async () => {
    const user = await prisma.user.findUnique({ where: { username: usuario } });
    expect(user?.passwordHash).toBeTruthy();
    expect(user?.passwordHash).not.toContain(clave);
    expect(user?.passwordHash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
  });
});

describe('autenticar', () => {
  it('entra con el username', async () => {
    const res = await autenticar(usuario, clave);
    expect(res.ok).toBe(true);
  });

  it('entra con el email', async () => {
    const res = await autenticar(email, clave);
    expect(res.ok).toBe(true);
  });

  it('rechaza contraseña incorrecta con mensaje genérico', async () => {
    const res = await autenticar(usuario, 'claveIncorrecta');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('Usuario o contraseña incorrectos');
  });

  it('usa el MISMO mensaje para usuario inexistente (no filtra si la cuenta existe)', async () => {
    const res = await autenticar('no_existe_jamas_xyz', 'loQueSea');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('Usuario o contraseña incorrectos');
  });

  it('rechaza cuentas suspendidas', async () => {
    await prisma.user.update({ where: { username: usuario }, data: { suspended: true } });
    const res = await autenticar(usuario, clave);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('suspendida');
    await prisma.user.update({ where: { username: usuario }, data: { suspended: false } });
  });
});
