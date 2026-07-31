import { notFound } from 'next/navigation';
import DemoMesa from './demo';

export const metadata = { title: 'Demo de mesa' };

/**
 * Banco de pruebas de la mesa con estado simulado (sin partida en vivo).
 * Solo existe en desarrollo: en producción responde 404.
 */
export default function DemoMesaPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <DemoMesa />;
}
