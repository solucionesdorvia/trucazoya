'use server';

/** Amigos, bloqueos y reportes. */

import { revalidatePath } from 'next/cache';
import { prisma } from '@trucazo/db';
import { requireUser } from '@/lib/session';

async function porUsername(username: string) {
  return prisma.user.findUnique({ where: { username }, select: { id: true } });
}

export async function enviarSolicitud(formData: FormData): Promise<void> {
  const me = await requireUser();
  const destino = await porUsername(String(formData.get('username') ?? ''));
  if (!destino || destino.id === me.id) return;

  // Si el otro ya me mandó solicitud, la aceptamos en vez de duplicar.
  const inversa = await prisma.friendship.findUnique({
    where: { fromId_toId: { fromId: destino.id, toId: me.id } },
  });
  if (inversa) {
    await prisma.friendship.update({ where: { id: inversa.id }, data: { state: 'ACCEPTED' } });
  } else {
    await prisma.friendship.upsert({
      where: { fromId_toId: { fromId: me.id, toId: destino.id } },
      update: {},
      create: { fromId: me.id, toId: destino.id, state: 'PENDING' },
    });
  }
  revalidatePath('/amigos');
}

export async function responderSolicitud(formData: FormData): Promise<void> {
  const me = await requireUser();
  const id = String(formData.get('id') ?? '');
  const aceptar = formData.get('accion') === 'aceptar';

  const sol = await prisma.friendship.findUnique({ where: { id } });
  if (!sol || sol.toId !== me.id) return; // sólo el destinatario responde

  if (aceptar) {
    await prisma.friendship.update({ where: { id }, data: { state: 'ACCEPTED' } });
  } else {
    await prisma.friendship.delete({ where: { id } });
  }
  revalidatePath('/amigos');
}

export async function eliminarAmigo(formData: FormData): Promise<void> {
  const me = await requireUser();
  const otroId = String(formData.get('userId') ?? '');
  await prisma.friendship.deleteMany({
    where: {
      OR: [
        { fromId: me.id, toId: otroId },
        { fromId: otroId, toId: me.id },
      ],
    },
  });
  revalidatePath('/amigos');
}

export async function reportar(formData: FormData): Promise<void> {
  const me = await requireUser();
  const username = String(formData.get('username') ?? '');
  const motivo = String(formData.get('motivo') ?? 'OTRO');
  const detalle = String(formData.get('detalle') ?? '').slice(0, 500) || undefined;
  const matchId = String(formData.get('matchId') ?? '') || undefined;

  const destino = await porUsername(username);
  if (!destino || destino.id === me.id) return;

  await prisma.report.create({
    data: {
      reporterId: me.id,
      reportedId: destino.id,
      reason: motivo,
      detail: detalle,
      matchId,
      state: 'OPEN',
    },
  });
  revalidatePath('/');
}
