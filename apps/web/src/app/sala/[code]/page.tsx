import { redirect } from 'next/navigation';
import { prisma } from '@trucazo/db';
import { SalaVivo } from '@/components/sala/SalaVivo';
import { getSessionUser } from '@/lib/session';

export const metadata = { title: 'Sala' };

export default async function PaginaSala({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/ingresar?volver=/sala/${code}`);

  const room = await prisma.room.findUnique({
    where: { code: code.toUpperCase() },
    select: { id: true, state: true },
  });
  if (!room) redirect('/inicio?error=sala-inexistente');

  return <SalaVivo code={code.toUpperCase()} userId={user.id} />;
}
