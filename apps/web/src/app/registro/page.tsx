'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { registrarse, type EstadoForm } from '../acciones-auth';
import { Boton, Campo, Logo } from '@/components/ui';

const inicial: EstadoForm = {};

export default function Registro() {
  const [estado, accion, pendiente] = useActionState(registrarse, inicial);

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

        <form action={accion} className="mt-6 flex flex-col gap-4">
          <Campo
            label="Nombre de usuario"
            name="username"
            autoComplete="username"
            placeholder="elmatador"
            required
            minLength={3}
            maxLength={20}
            error={estado.campo === 'username' ? estado.error : undefined}
          />
          <Campo
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="vos@email.com"
            required
            error={estado.campo === 'email' ? estado.error : undefined}
          />
          <Campo
            label="Contraseña"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="Mínimo 8 caracteres"
            required
            minLength={8}
            error={estado.campo === 'password' ? estado.error : undefined}
          />
          <Campo
            label="Fecha de nacimiento"
            name="birthdate"
            type="date"
            autoComplete="bday"
            required
            error={estado.campo === 'birthdate' ? estado.error : undefined}
          />
          <p className="-mt-1 text-xs text-tinta-400">Trucazo es solo para mayores de 18 años.</p>

          {estado.error && !estado.campo && (
            <p role="alert" className="text-sm text-canto-400">
              {estado.error}
            </p>
          )}

          <Boton type="submit" tamaño="lg" disabled={pendiente} className="mt-1">
            {pendiente ? 'Creando…' : 'Crear cuenta y jugar'}
          </Boton>
        </form>

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
