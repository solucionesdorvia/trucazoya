/**
 * Ledger contable append-only.
 *
 * Reglas innegociables:
 * 1. El saldo NUNCA se edita "a mano": siempre pasa por un asiento del ledger.
 * 2. Cada asiento guarda saldo anterior y posterior ⇒ la cadena es auditable y
 *    verificable (`after = before + amount`).
 * 3. Toda operación lleva `idempotencyKey`: repetirla no duplica el movimiento.
 * 4. La fila de la billetera se bloquea (SELECT ... FOR UPDATE) dentro de la
 *    transacción, así dos operaciones simultáneas se serializan en vez de
 *    pisarse (evita doble acreditación y saldos negativos por carrera).
 */

import { prisma, type LedgerType, type Prisma, type PrismaClient } from '@trucazo/db';

export class ErrorEconomia extends Error {
  constructor(
    message: string,
    readonly codigo: 'SALDO_INSUFICIENTE' | 'BILLETERA_INEXISTENTE' | 'MONTO_INVALIDO',
  ) {
    super(message);
    this.name = 'ErrorEconomia';
  }
}

export interface Movimiento {
  userId: string;
  type: LedgerType;
  /** Delta con signo: positivo acredita, negativo debita. */
  amount: bigint;
  idempotencyKey: string;
  reason?: string;
  matchId?: string;
  betId?: string;
  tournamentId?: string;
  /** Quién originó el movimiento (cajero o admin). */
  actorUserId?: string;
  metadata?: Prisma.InputJsonValue;
}

export interface ResultadoMovimiento {
  id: string;
  balanceBefore: bigint;
  balanceAfter: bigint;
  /** true si el movimiento ya existía (reintento idempotente). */
  repetido: boolean;
}

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * Aplica UN movimiento dentro de una transacción existente.
 * Exportado para poder componer varias operaciones atómicamente
 * (p.ej. liquidar una apuesta: premio + comisión en el mismo commit).
 */
export async function aplicarMovimiento(tx: Tx, mov: Movimiento): Promise<ResultadoMovimiento> {
  if (mov.amount === 0n) {
    throw new ErrorEconomia('El monto no puede ser cero', 'MONTO_INVALIDO');
  }

  // Idempotencia: si ya existe el asiento con esta clave, devolvemos el mismo
  // resultado sin tocar el saldo.
  const previo = await tx.ledgerEntry.findUnique({
    where: { userId_idempotencyKey: { userId: mov.userId, idempotencyKey: mov.idempotencyKey } },
  });
  if (previo) {
    return {
      id: previo.id,
      balanceBefore: previo.balanceBefore,
      balanceAfter: previo.balanceAfter,
      repetido: true,
    };
  }

  // Bloqueo de fila: serializa operaciones concurrentes sobre la misma billetera.
  const filas = await tx.$queryRaw<Array<{ id: string; balance: bigint }>>`
    SELECT id, balance FROM "Wallet" WHERE "userId" = ${mov.userId} FOR UPDATE
  `;
  const wallet = filas[0];
  if (!wallet) {
    throw new ErrorEconomia('El usuario no tiene billetera', 'BILLETERA_INEXISTENTE');
  }

  const balanceBefore = BigInt(wallet.balance);
  const balanceAfter = balanceBefore + mov.amount;

  // Invariante duro: nunca saldo negativo.
  if (balanceAfter < 0n) {
    throw new ErrorEconomia(
      `Saldo insuficiente: tiene ${balanceBefore}, necesita ${-mov.amount}`,
      'SALDO_INSUFICIENTE',
    );
  }

  const asiento = await tx.ledgerEntry.create({
    data: {
      userId: mov.userId,
      type: mov.type,
      amount: mov.amount,
      balanceBefore,
      balanceAfter,
      idempotencyKey: mov.idempotencyKey,
      reason: mov.reason,
      matchId: mov.matchId,
      betId: mov.betId,
      tournamentId: mov.tournamentId,
      actorUserId: mov.actorUserId,
      metadata: mov.metadata ?? {},
    },
  });

  await tx.wallet.update({
    where: { id: wallet.id },
    data: { balance: balanceAfter, version: { increment: 1 } },
  });

  return { id: asiento.id, balanceBefore, balanceAfter, repetido: false };
}

/** Aplica un movimiento en su propia transacción. */
export function registrarMovimiento(mov: Movimiento): Promise<ResultadoMovimiento> {
  return prisma.$transaction((tx) => aplicarMovimiento(tx, mov));
}

/**
 * Aplica varios movimientos de forma atómica: o entran todos, o ninguno.
 * Se usa para liquidaciones (premio + comisión) donde un estado parcial sería
 * plata mal contada.
 */
export function registrarMovimientos(movs: Movimiento[]): Promise<ResultadoMovimiento[]> {
  return prisma.$transaction(async (tx) => {
    const out: ResultadoMovimiento[] = [];
    for (const m of movs) out.push(await aplicarMovimiento(tx, m));
    return out;
  });
}

/**
 * Cuenta de sistema donde se acumula la comisión de plataforma.
 *
 * La comisión NO puede ser un asiento suelto en el ledger de un jugador: eso
 * rompería la cadena `before → after` de ese usuario y haría fallar la
 * auditoría. Se lleva por partida doble, acreditándola a esta cuenta, así la
 * recaudación queda auditable con las mismas garantías que cualquier saldo.
 */
export const USUARIO_PLATAFORMA = '_plataforma';

let idPlataformaCache: string | null = null;

export async function cuentaPlataforma(): Promise<string> {
  if (idPlataformaCache) return idPlataformaCache;
  const existente = await prisma.user.findUnique({
    where: { username: USUARIO_PLATAFORMA },
    select: { id: true },
  });
  if (existente) {
    idPlataformaCache = existente.id;
    return existente.id;
  }
  const creado = await prisma.user.create({
    data: {
      username: USUARIO_PLATAFORMA,
      profile: { create: { displayName: 'Plataforma' } },
      wallet: { create: { balance: 0n } },
    },
    select: { id: true },
  });
  idPlataformaCache = creado.id;
  return creado.id;
}

/** Saldo disponible (el bloqueado por apuestas/retiros va aparte). */
export async function saldoDe(userId: string): Promise<{ balance: bigint; locked: bigint }> {
  const w = await prisma.wallet.findUnique({ where: { userId } });
  if (!w) throw new ErrorEconomia('El usuario no tiene billetera', 'BILLETERA_INEXISTENTE');
  return { balance: w.balance, locked: w.locked };
}

/**
 * Auditoría: recorre el ledger de un usuario y verifica que la cadena de
 * saldos sea consistente y coincida con la billetera. Lo usa el panel de admin.
 */
export async function auditarUsuario(userId: string): Promise<{
  ok: boolean;
  movimientos: number;
  saldoCalculado: bigint;
  saldoBilletera: bigint;
  problemas: string[];
}> {
  const [asientos, wallet] = await Promise.all([
    // Orden por (fecha, id): dos asientos pueden caer en el mismo milisegundo
    // y sin el desempate el recorrido de la cadena sería no determinista.
    prisma.ledgerEntry.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
    prisma.wallet.findUnique({ where: { userId } }),
  ]);

  const problemas: string[] = [];
  let acumulado = 0n;

  for (const a of asientos) {
    if (a.balanceAfter !== a.balanceBefore + a.amount) {
      problemas.push(`Asiento ${a.id}: after(${a.balanceAfter}) ≠ before + amount`);
    }
    if (a.balanceBefore !== acumulado) {
      problemas.push(`Asiento ${a.id}: before(${a.balanceBefore}) ≠ acumulado(${acumulado})`);
    }
    acumulado = a.balanceAfter;
  }

  // Invariante contable: el ledger debe cuadrar con TODO lo que el usuario
  // tiene, no sólo con lo disponible. Lo bloqueado (retiros en curso, apuestas
  // reservadas) sigue siendo suyo: salió de `balance` pero no del patrimonio.
  const saldoBilletera = (wallet?.balance ?? 0n) + (wallet?.locked ?? 0n);
  if (acumulado !== saldoBilletera) {
    problemas.push(
      `El ledger suma ${acumulado} pero la billetera tiene ${saldoBilletera} ` +
        `(disponible ${wallet?.balance ?? 0n} + bloqueado ${wallet?.locked ?? 0n})`,
    );
  }

  return {
    ok: problemas.length === 0,
    movimientos: asientos.length,
    saldoCalculado: acumulado,
    saldoBilletera,
    problemas,
  };
}
