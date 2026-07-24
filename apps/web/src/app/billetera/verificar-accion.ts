'use server';

import { enviarVerificacion } from '@/lib/verificacion';
import { requireUser } from '@/lib/session';

export async function reenviarVerificacion(): Promise<void> {
  const user = await requireUser();
  await enviarVerificacion(user.id).catch(() => undefined);
}
