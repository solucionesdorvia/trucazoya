import Link from 'next/link';
import { Logo } from '@/components/ui';

export const metadata = { title: 'Política de Privacidad' };

export default function Privacidad() {
  return (
    <div className="min-h-dvh px-5 py-8">
      <article className="mx-auto max-w-2xl">
        <Link href="/" aria-label="Inicio">
          <Logo size={28} />
        </Link>
        <h1 className="mt-6 text-2xl font-bold tracking-tight">Política de Privacidad</h1>
        <p className="mt-1 text-xs text-tinta-500">Última actualización: 2026-07-28</p>

        <div className="mt-6 space-y-5 text-sm leading-relaxed text-tinta-300">
          <section>
            <h2 className="font-semibold text-tinta-50">1. Qué datos recopilamos</h2>
            <p>
              Datos de cuenta (usuario, email), fecha de nacimiento y provincia (verificación de
              edad y jurisdicción), datos de identidad si hacés KYC (nombre y documento), historial
              de juego y movimientos de monedas. Guardamos sólo el hash de tu contraseña y de los
              tokens de sesión, nunca en texto plano.
            </p>
          </section>
          <section>
            <h2 className="font-semibold text-tinta-50">2. Para qué los usamos</h2>
            <p>
              Operar el servicio, verificar edad e identidad, prevenir fraude y lavado, cumplir
              obligaciones legales y aplicar tus herramientas de juego responsable.
            </p>
          </section>
          <section>
            <h2 className="font-semibold text-tinta-50">3. Con quién los compartimos</h2>
            <p>
              Con cajeros autorizados sólo lo necesario para procesar cargas y retiros, y con
              autoridades cuando la ley lo exige. No vendemos tus datos.
            </p>
          </section>
          <section>
            <h2 className="font-semibold text-tinta-50">4. Conservación y seguridad</h2>
            <p>
              Conservamos los registros contables y de identidad por el plazo que exige la normativa
              de juego y prevención de lavado. Aplicamos medidas técnicas para proteger tu
              información.
            </p>
          </section>
          <section>
            <h2 className="font-semibold text-tinta-50">5. Tus derechos</h2>
            <p>
              Podés acceder, rectificar o solicitar la eliminación de tus datos personales (sujeto a
              las obligaciones de conservación legal) escribiendo al operador.
            </p>
          </section>
          <p className="text-xs text-tinta-500">
            Documento base; el operador con licencia debe adaptarlo a la Ley 25.326 de Protección de
            Datos Personales y a la normativa de su jurisdicción con asesoría legal.
          </p>
        </div>
      </article>
    </div>
  );
}
