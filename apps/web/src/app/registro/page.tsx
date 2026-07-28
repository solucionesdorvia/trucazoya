import Link from 'next/link';
import { PROVINCIAS_AR } from '@trucazo/shared';
import { FormRegistro } from '@/components/FormRegistro';
import { Logo } from '@/components/ui';

export const metadata = { title: 'Crear cuenta' };

export default function Registro() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <Link href="/" className="mb-8">
        <Logo size={36} />
      </Link>

      <main id="contenido" className="panel w-full max-w-sm p-7 animar-aparecer">
        <h1 className="text-2xl font-bold tracking-tight">Crear cuenta</h1>
        <p className="mt-1.5 text-sm text-tinta-400">
          Te damos 500 monedas para arrancar. Sin tarjeta.
        </p>

        <FormRegistro provincias={PROVINCIAS_AR} />

        <p className="mt-5 text-center text-sm text-tinta-400">
          ¿Ya tenés cuenta?{' '}
          <Link href="/ingresar" className="font-medium text-oro-400 hover:text-oro-500">
            Ingresá
          </Link>
        </p>
      </main>
    </div>
  );
}
