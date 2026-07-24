import { redirect } from 'next/navigation';
import { catalogoPara, saldoDe } from '@trucazo/economia';
import { Encabezado } from '@/components/Encabezado';
import { Panel, Pildora } from '@/components/ui';
import { getSessionUser } from '@/lib/session';
import { comprar, equipar } from './acciones';

export const metadata = { title: 'Tienda' };

const TIPO: Record<string, string> = {
  CARD_DESIGN: 'Diseños de carta',
  CARD_BACK: 'Reversos',
  TABLE: 'Mesas',
  MAT: 'Tapetes',
  AVATAR: 'Avatares',
  FRAME: 'Marcos',
  BADGE: 'Insignias',
  EMOJI: 'Emojis',
  TITLE: 'Títulos',
};

export default async function Tienda() {
  const user = await getSessionUser();
  if (!user) redirect('/ingresar');

  const [catalogo, saldo] = await Promise.all([catalogoPara(user.id), saldoDe(user.id)]);

  // Agrupar por tipo.
  const porTipo = new Map<string, typeof catalogo>();
  for (const c of catalogo) {
    porTipo.set(c.kind, [...(porTipo.get(c.kind) ?? []), c]);
  }

  return (
    <div className="min-h-dvh">
      <Encabezado user={user} />
      <main id="contenido" className="mx-auto max-w-3xl px-5 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">Tienda</h1>
          <span className="font-mono text-lg font-bold text-oro-400">
            🪙 {saldo.balance.toLocaleString('es-AR')}
          </span>
        </div>
        <p className="mt-1.5 text-sm text-tinta-400">
          Sólo estética. Nada de esto te da ventaja en la mesa.
        </p>

        {[...porTipo.entries()].map(([tipo, items]) => (
          <section key={tipo} className="mt-7">
            <h2 className="text-sm font-medium text-tinta-400">{TIPO[tipo] ?? tipo}</h2>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {items.map((c) => (
                <Panel key={c.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-tinta-50">{c.name}</span>
                    <span className="block text-xs text-tinta-400">
                      {c.priceCoins === 0 ? 'Gratis' : `🪙 ${c.priceCoins.toLocaleString('es-AR')}`}
                    </span>
                  </span>
                  {c.equipado ? (
                    <Pildora tono="verde">Equipado</Pildora>
                  ) : c.tengo ? (
                    <form action={equipar}>
                      <input type="hidden" name="id" value={c.id} />
                      <button className="h-9 rounded-lg border border-oro-500/40 px-3 text-sm text-oro-400">
                        Equipar
                      </button>
                    </form>
                  ) : (
                    <form action={comprar}>
                      <input type="hidden" name="id" value={c.id} />
                      <button
                        disabled={Number(saldo.balance) < c.priceCoins}
                        className="h-9 rounded-lg bg-oro-500 px-3 text-sm font-semibold text-noche-950 disabled:opacity-40"
                      >
                        Comprar
                      </button>
                    </form>
                  )}
                </Panel>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
