import Link from 'next/link';
import { salir } from '@/app/acciones-auth';
import type { SessionUser } from '@/lib/session';
import { Boton, Logo, Pildora } from './ui';

/** Barra superior de la app autenticada: marca, saldo y sesión. */
export function Encabezado({ user }: { user: SessionUser }) {
  return (
    <header className="sticky top-0 z-40 border-b border-noche-700 bg-noche-900/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-3">
        <Link href="/inicio" aria-label="Ir al inicio">
          <Logo size={28} />
        </Link>

        <div className="flex items-center gap-3">
          <Link
            href="/billetera"
            className="flex items-center gap-2 rounded-xl border border-oro-500/25 bg-oro-500/10 px-3 py-1.5 transition-colors hover:bg-oro-500/20"
            aria-label={`Billetera: ${user.balance} monedas`}
          >
            <span aria-hidden="true">🪙</span>
            <span className="font-mono text-sm font-semibold text-oro-400">
              {user.balance.toLocaleString('es-AR')}
            </span>
          </Link>

          <div className="hidden items-center gap-2 sm:flex">
            <span className="text-sm text-tinta-200">{user.displayName}</span>
            {user.isGuest && <Pildora>Invitado</Pildora>}
            {user.role === 'ADMIN' && <Pildora tono="rojo">Admin</Pildora>}
            {user.role === 'CASHIER' && (
              <Link href="/cajero" aria-label="Panel de cajero">
                <Pildora tono="verde">Cajero</Pildora>
              </Link>
            )}
          </div>

          <form action={salir}>
            <Boton variante="fantasma" tamaño="sm" type="submit">
              Salir
            </Boton>
          </form>
        </div>
      </div>
    </header>
  );
}
