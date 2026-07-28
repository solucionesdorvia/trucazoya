import { redirect } from 'next/navigation';
import { exclusionActiva, limitesDe } from '@trucazo/economia';
import { Encabezado } from '@/components/Encabezado';
import { FormJuegoResponsable } from '@/components/FormJuegoResponsable';
import { getSessionUser } from '@/lib/session';

export const metadata = { title: 'Juego responsable' };

export default async function JuegoResponsable() {
  const user = await getSessionUser();
  if (!user) redirect('/ingresar');

  const [limites, exclusion] = await Promise.all([limitesDe(user.id), exclusionActiva(user.id)]);

  return (
    <>
      <Encabezado user={user} />
      <main id="contenido" className="mx-auto max-w-3xl px-5 py-8">
        <h1 className="text-2xl font-bold tracking-tight">Juego responsable</h1>
        <p className="mt-1.5 text-sm text-tinta-400">
          Herramientas para que tengas el control. El juego es un entretenimiento, no una forma de
          ganar plata ni de recuperar pérdidas.
        </p>

        <div className="mt-6">
          <FormJuegoResponsable
            limites={{
              dailyDepositMax:
                limites.dailyDepositMax === null ? null : Number(limites.dailyDepositMax),
              weeklyDepositMax:
                limites.weeklyDepositMax === null ? null : Number(limites.weeklyDepositMax),
              dailyLossMax: limites.dailyLossMax === null ? null : Number(limites.dailyLossMax),
              sessionMinutesMax: limites.sessionMinutesMax,
            }}
            exclusion={
              exclusion
                ? {
                    kind: exclusion.kind,
                    until: exclusion.until ? exclusion.until.toLocaleDateString('es-AR') : null,
                  }
                : null
            }
          />
        </div>

        <p className="mt-8 text-xs text-tinta-500">
          Si sentís que el juego dejó de ser un juego, pedí ayuda: línea nacional de Juego
          Responsable <span className="font-mono">0800-333-0333</span> (gratuita y confidencial).
        </p>
      </main>
    </>
  );
}
