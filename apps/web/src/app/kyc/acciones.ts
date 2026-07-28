'use server';

/** Server Action de KYC del jugador: envía sus datos de identidad a revisión. */

import { revalidatePath } from 'next/cache';
import { enviarKyc } from '@trucazo/economia';
import { requireUser } from '@/lib/session';

export interface EstadoKyc {
  error?: string;
  ok?: string;
}

export async function enviarKycAccion(_prev: EstadoKyc, formData: FormData): Promise<EstadoKyc> {
  const user = await requireUser();
  const docType = String(formData.get('docType') ?? 'DNI');

  const r = await enviarKyc({
    userId: user.id,
    fullName: String(formData.get('fullName') ?? ''),
    docType: docType === 'PASSPORT' ? 'PASSPORT' : 'DNI',
    docNumber: String(formData.get('docNumber') ?? ''),
    docImageUrl: String(formData.get('docImageUrl') ?? '').trim() || undefined,
  });
  if (!r.ok) return { error: r.error };

  revalidatePath('/kyc');
  return { ok: 'Enviamos tu verificación. Te avisamos cuando la revisemos.' };
}
