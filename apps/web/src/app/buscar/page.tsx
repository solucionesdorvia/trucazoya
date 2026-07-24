import { redirect } from 'next/navigation';
import { BuscarPartida } from '@/components/BuscarPartida';
import { getSessionUser } from '@/lib/session';

export const metadata = { title: 'Buscar partida' };

export default async function Buscar() {
  const user = await getSessionUser();
  if (!user) redirect('/ingresar');
  return <BuscarPartida />;
}
