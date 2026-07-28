import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Logo } from '@/components/ui';

export const metadata = { title: 'Verificar reparto' };

async function ir(formData: FormData) {
  'use server';
  const id = String(formData.get('matchId') ?? '').trim();
  if (id) redirect(`/reparto/${encodeURIComponent(id)}`);
}

export default function RepartoIndex() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <Link href="/" className="mb-8" aria-label="Inicio">
        <Logo size={36} />
      </Link>

      <main id="contenido" className="panel w-full max-w-lg p-7">
        <h1 className="text-2xl font-bold tracking-tight">Verificar un reparto</h1>
        <p className="mt-1.5 text-sm text-tinta-400">
          Trucazo baraja con un esquema <strong>commit-reveal</strong>: antes de cada mano publica
          el hash de una semilla secreta y, al terminar la partida, revela la semilla. Con ella
          cualquiera puede recomputar el mazo y comprobar que el reparto no se tocó. Pegá el ID de
          una partida para verificarlo.
        </p>

        <form action={ir} className="mt-6 flex flex-col gap-3 sm:flex-row">
          <input
            name="matchId"
            required
            placeholder="ID de la partida"
            className="h-11 flex-1 rounded-xl border border-noche-700 bg-noche-800/80 px-3.5 font-mono text-tinta-50 placeholder:text-tinta-600 focus:border-oro-500"
          />
          <button className="h-11 rounded-xl bg-oro-500 px-5 font-semibold text-noche-950 hover:bg-oro-400">
            Verificar
          </button>
        </form>

        <p className="mt-4 text-xs text-tinta-500">
          El ID de la partida aparece al terminar cada juego y en tu historial.
        </p>
      </main>
    </div>
  );
}
