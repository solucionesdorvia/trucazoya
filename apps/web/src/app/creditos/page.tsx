import Link from 'next/link';
import { Logo } from '@/components/ui';

export const metadata = { title: 'Créditos' };

export default function Creditos() {
  return (
    <div className="min-h-dvh px-5 py-8">
      <article className="mx-auto max-w-2xl">
        <Link href="/" aria-label="Inicio">
          <Logo size={28} />
        </Link>
        <h1 className="mt-6 text-2xl font-bold tracking-tight">Créditos</h1>

        <section className="mt-6 space-y-3 text-sm leading-relaxed text-tinta-300">
          <h2 className="font-semibold text-tinta-50">Arte de las cartas</h2>
          <p>
            El arte de la baraja española usado en Trucazo es obra de{' '}
            <a
              href="https://commons.wikimedia.org/wiki/Category:Spanish_playing_cards"
              className="text-oro-400 hover:text-oro-500"
              target="_blank"
              rel="noopener noreferrer"
            >
              Basquetteur
            </a>{' '}
            (Wikimedia Commons), en su versión SVG por carta de{' '}
            <a
              href="https://github.com/gjenkins20/spanish-playing-cards-svg"
              className="text-oro-400 hover:text-oro-500"
              target="_blank"
              rel="noopener noreferrer"
            >
              spanish-playing-cards-svg
            </a>
            .
          </p>
          <p>
            Licencia:{' '}
            <a
              href="https://creativecommons.org/licenses/by-sa/3.0/"
              className="text-oro-400 hover:text-oro-500"
              target="_blank"
              rel="noopener noreferrer"
            >
              Creative Commons Attribution-ShareAlike 3.0 (CC BY-SA 3.0)
            </a>
            . Los assets se distribuyen bajo la misma licencia; se renombraron y optimizaron para la
            app.
          </p>
        </section>
      </article>
    </div>
  );
}
