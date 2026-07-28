import Link from 'next/link';
import { Logo } from '@/components/ui';

export const metadata = { title: 'Términos y Condiciones' };

export default function Terminos() {
  return (
    <div className="min-h-dvh px-5 py-8">
      <article className="mx-auto max-w-2xl">
        <Link href="/" aria-label="Inicio">
          <Logo size={28} />
        </Link>
        <h1 className="mt-6 text-2xl font-bold tracking-tight">Términos y Condiciones</h1>
        <p className="mt-1 text-xs text-tinta-500">Última actualización: 2026-07-28</p>

        <div className="prose-trucazo mt-6 space-y-5 text-sm leading-relaxed text-tinta-300">
          <section>
            <h2 className="font-semibold text-tinta-50">1. Qué es Trucazo</h2>
            <p>
              Trucazo es una plataforma para jugar Truco Argentino en línea con una economía de
              monedas virtuales. Al usarla aceptás estos términos.
            </p>
          </section>
          <section>
            <h2 className="font-semibold text-tinta-50">2. Edad mínima</h2>
            <p>
              El servicio es exclusivamente para mayores de 18 años. Declarás y garantizás que sos
              mayor de edad. Podemos solicitar verificación de identidad (KYC) y suspender cuentas
              que no la cumplan.
            </p>
          </section>
          <section>
            <h2 className="font-semibold text-tinta-50">3. Monedas y cajeros</h2>
            <p>
              Las monedas se cargan y retiran a través de cajeros autorizados. Toda operación queda
              registrada en un libro contable auditable. Los retiros requieren cuenta verificada por
              email, edad e identidad (KYC) aprobada.
            </p>
          </section>
          <section>
            <h2 className="font-semibold text-tinta-50">4. Juego justo</h2>
            <p>
              El reparto de cartas usa un esquema criptográfico verificable (commit-reveal): antes
              de cada mano se publica el compromiso y al terminar se revela la semilla, de modo que
              cualquiera puede comprobar que no hubo manipulación en{' '}
              <Link href="/reparto" className="text-oro-400 hover:text-oro-500">
                la página de verificación
              </Link>
              . Está prohibido usar bots, colusión o cualquier ventaja indebida.
            </p>
          </section>
          <section>
            <h2 className="font-semibold text-tinta-50">5. Juego responsable</h2>
            <p>
              Ofrecemos herramientas de límites de carga y pérdida, y autoexclusión, disponibles en{' '}
              <Link href="/juego-responsable" className="text-oro-400 hover:text-oro-500">
                Juego responsable
              </Link>
              . El juego es un entretenimiento y no una fuente de ingresos. Si sentís que perdés el
              control, pedí ayuda a la línea 0800-333-0333.
            </p>
          </section>
          <section>
            <h2 className="font-semibold text-tinta-50">6. Jurisdicción</h2>
            <p>
              La operación con dinero real está regulada a nivel provincial. El servicio puede no
              estar disponible en tu jurisdicción. Sos responsable de cumplir la normativa aplicable
              en tu lugar de residencia.
            </p>
          </section>
          <section>
            <h2 className="font-semibold text-tinta-50">7. Conducta y sanciones</h2>
            <p>
              Podemos suspender o cerrar cuentas por fraude, multicuenta, colusión o incumplimiento
              de estos términos, reteniendo saldos de origen ilícito conforme a la ley.
            </p>
          </section>
          <p className="text-xs text-tinta-500">
            Este documento es una base y debe ser revisado por asesoría legal del operador con
            licencia antes de operar con dinero real.
          </p>
        </div>
      </article>
    </div>
  );
}
