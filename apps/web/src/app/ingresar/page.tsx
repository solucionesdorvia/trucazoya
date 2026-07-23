'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { ingresar, type EstadoForm } from '../acciones-auth';
import { Boton, Campo, Logo } from '@/components/ui';

const inicial: EstadoForm = {};

export default function Ingresar() {
  const [estado, accion, pendiente] = useActionState(ingresar, inicial);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <Link href="/" className="mb-8">
        <Logo size={36} />
      </Link>

      <main id="contenido" className="panel w-full max-w-sm p-7 animar-aparecer">
        <h1 className="text-2xl font-bold tracking-tight">Ingresar</h1>
        <p className="mt-1.5 text-sm text-tinta-400">Bienvenido de vuelta a la mesa.</p>

        <form action={accion} className="mt-6 flex flex-col gap-4">
          <Campo
            label="Usuario o email"
            name="emailOrUsername"
            autoComplete="username"
            placeholder="elmatador"
            required
          />
          <Campo
            label="Contraseña"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />

          {estado.error && (
            <p role="alert" className="text-sm text-canto-400">
              {estado.error}
            </p>
          )}

          <Boton type="submit" tamaño="lg" disabled={pendiente} className="mt-1">
            {pendiente ? 'Entrando…' : 'Entrar'}
          </Boton>
        </form>

        <p className="mt-5 text-center text-sm text-tinta-400">
          ¿No tenés cuenta?{' '}
          <Link href="/registro" className="font-medium text-oro-400 hover:text-oro-500">
            Registrate
          </Link>
        </p>
      </main>
    </div>
  );
}
