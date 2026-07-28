'use server';

/**
 * Server Actions de juego responsable. La autorización sale de la sesión: cada
 * jugador sólo puede tocar SUS propios límites y autoexclusión.
 */

import { revalidatePath } from 'next/cache';
import { autoexcluir, guardarLimites } from '@trucazo/economia';
import { requireUser } from '@/lib/session';

export interface EstadoRG {
  error?: string;
  ok?: string;
}

/** Convierte un campo de formulario a bigint, o null si está vacío. */
function aTope(valor: FormDataEntryValue | null): bigint | null {
  const s = String(valor ?? '').trim();
  if (s === '') return null;
  const n = Number(s);
  if (!Number.isInteger(n) || n < 0) return null;
  return BigInt(n);
}

export async function guardarLimitesAccion(_prev: EstadoRG, formData: FormData): Promise<EstadoRG> {
  const user = await requireUser();
  const sesion = String(formData.get('sessionMinutesMax') ?? '').trim();

  await guardarLimites(user.id, {
    dailyDepositMax: aTope(formData.get('dailyDepositMax')),
    weeklyDepositMax: aTope(formData.get('weeklyDepositMax')),
    dailyLossMax: aTope(formData.get('dailyLossMax')),
    sessionMinutesMax: sesion === '' ? null : Math.max(0, Number(sesion)) || null,
  });

  revalidatePath('/juego-responsable');
  return { ok: 'Límites guardados' };
}

export async function autoexcluirAccion(_prev: EstadoRG, formData: FormData): Promise<EstadoRG> {
  const user = await requireUser();
  const tipo = String(formData.get('tipo') ?? '');

  if (tipo === 'PERMANENT') {
    const r = await autoexcluir({ userId: user.id, kind: 'PERMANENT' });
    if (!r.ok) return { error: r.error };
  } else {
    const dias = Number(formData.get('dias') ?? 0);
    const r = await autoexcluir({ userId: user.id, kind: 'TEMPORARY', dias });
    if (!r.ok) return { error: r.error };
  }

  revalidatePath('/juego-responsable');
  return { ok: 'Autoexclusión activada' };
}
