'use server';

import { revalidatePath } from 'next/cache';
import { comprarCosmetico, equiparCosmetico } from '@trucazo/economia';
import { requireUser } from '@/lib/session';

export async function comprar(formData: FormData): Promise<void> {
  const user = await requireUser();
  await comprarCosmetico(user.id, String(formData.get('id') ?? ''));
  revalidatePath('/tienda');
}

export async function equipar(formData: FormData): Promise<void> {
  const user = await requireUser();
  await equiparCosmetico(user.id, String(formData.get('id') ?? ''));
  revalidatePath('/tienda');
}
