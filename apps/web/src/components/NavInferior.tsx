'use client';

/**
 * Navegación fija de mobile. En el encabezado los links viven detrás de
 * `sm:block`, así que en celular no había forma de llegar a Ranking, Torneos
 * ni Tienda salvo tipeando la URL.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/inicio', txt: 'Inicio', ico: '🏠' },
  { href: '/buscar', txt: 'Jugar', ico: '🃏' },
  { href: '/ranking', txt: 'Ranking', ico: '🏆' },
  { href: '/torneos', txt: 'Torneos', ico: '⚔️' },
  { href: '/billetera', txt: 'Fichas', ico: '🪙' },
];

export function NavInferior() {
  const path = usePathname();
  // En la mesa la nav estorba: la pantalla es a pantalla completa y sin scroll.
  if (path?.startsWith('/sala/')) return null;

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-noche-700 bg-noche-950/95 backdrop-blur sm:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="flex">
        {ITEMS.map((i) => {
          const activo = path === i.href;
          return (
            <li key={i.href} className="flex-1">
              <Link
                href={i.href}
                aria-current={activo ? 'page' : undefined}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-xs font-medium ${
                  activo ? 'text-oro-400' : 'text-tinta-400'
                }`}
              >
                <span aria-hidden="true" className="text-lg leading-none">
                  {i.ico}
                </span>
                {i.txt}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
