import Link from 'next/link';
import { verificarEmail } from '@/lib/verificacion';
import { Boton, Logo, Panel } from '@/components/ui';

export const metadata = { title: 'Verificar email' };

export default async function Verificar({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const resultado = token ? await verificarEmail(token) : { ok: false, error: 'Falta el token' };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <Link href="/" className="mb-8">
        <Logo size={36} />
      </Link>
      <Panel className="w-full max-w-sm text-center animar-aparecer">
        <div className="text-5xl" aria-hidden="true">
          {resultado.ok ? '✅' : '⚠️'}
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">
          {resultado.ok ? '¡Email verificado!' : 'No se pudo verificar'}
        </h1>
        <p className="mt-2 text-tinta-400">
          {resultado.ok
            ? 'Ya podés retirar monedas y usar todas las funciones.'
            : (resultado.error ?? 'Probá pedir un nuevo link desde tu cuenta.')}
        </p>
        <Link href="/inicio" className="mt-6 inline-block">
          <Boton>Ir al inicio</Boton>
        </Link>
      </Panel>
    </div>
  );
}
