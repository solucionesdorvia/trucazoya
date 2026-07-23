import { describe, expect, it } from 'vitest';
import { emitirTokenPartida, generarCodigoSala, verificarTokenPartida } from './token.js';

const SECRET = 'un-secreto-de-prueba-suficientemente-largo';

describe('token de partida', () => {
  it('ida y vuelta: emite y verifica', () => {
    const t = emitirTokenPartida({ userId: 'u1', username: 'pepe' }, SECRET);
    const claims = verificarTokenPartida(t, SECRET);
    expect(claims?.userId).toBe('u1');
    expect(claims?.username).toBe('pepe');
  });

  it('rechaza token firmado con otro secreto', () => {
    const t = emitirTokenPartida({ userId: 'u1', username: 'pepe' }, SECRET);
    expect(verificarTokenPartida(t, 'otro-secreto-distinto-igual-de-largo')).toBeNull();
  });

  it('rechaza payload manipulado', () => {
    const t = emitirTokenPartida({ userId: 'u1', username: 'pepe' }, SECRET);
    const [, firma] = t.split('.');
    const falso = Buffer.from(
      JSON.stringify({ userId: 'admin', username: 'admin', exp: 9999999999 }),
    ).toString('base64url');
    expect(verificarTokenPartida(`${falso}.${firma}`, SECRET)).toBeNull();
  });

  it('rechaza token vencido', () => {
    const t = emitirTokenPartida({ userId: 'u1', username: 'pepe' }, SECRET, -10);
    expect(verificarTokenPartida(t, SECRET)).toBeNull();
  });

  it('rechaza basura', () => {
    expect(verificarTokenPartida('cualquiera', SECRET)).toBeNull();
    expect(verificarTokenPartida('', SECRET)).toBeNull();
  });
});

describe('código de sala', () => {
  it('genera 6 caracteres sin ambiguos (0/O/1/I)', () => {
    let n = 0;
    const code = generarCodigoSala(() => (n++ * 7) % 32);
    expect(code).toHaveLength(6);
    expect(code).not.toMatch(/[01OI]/);
  });
});
