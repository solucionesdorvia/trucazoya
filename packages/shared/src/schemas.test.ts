import { describe, expect, it } from 'vitest';
import { whatsappLink } from './constants.js';
import { cashierDepositSchema, registerSchema, roomConfigSchema } from './schemas.js';

describe('schemas de validación', () => {
  it('rechaza username inválido', () => {
    const r = registerSchema.safeParse({ username: 'a b', email: 'x@y.com', password: '12345678' });
    expect(r.success).toBe(false);
  });

  it('acepta registro válido', () => {
    const r = registerSchema.safeParse({
      username: 'valen_truco',
      email: 'v@trucazo.com',
      password: 'supersecreta',
    });
    expect(r.success).toBe(true);
  });

  it('aplica defaults en config de sala', () => {
    const r = roomConfigSchema.parse({ name: 'Sala Test', mode: 'CASUAL_1V1', pointsToWin: 30 });
    expect(r.florEnabled).toBe(true);
    expect(r.turnTimeoutSec).toBe(30);
  });

  it('exige monto positivo e idempotencyKey en depósito de cajero', () => {
    const bad = cashierDepositSchema.safeParse({ targetUserId: 'u1', amount: -5 });
    expect(bad.success).toBe(false);
  });
});

describe('whatsappLink', () => {
  it('genera un link wa.me con mensaje codificado', () => {
    const link = whatsappLink('+54 9 11 1234-5678', 'Hola, quiero cargar 500 monedas');
    expect(link).toContain('https://wa.me/5491112345678');
    expect(link).toContain('Hola');
  });
});
