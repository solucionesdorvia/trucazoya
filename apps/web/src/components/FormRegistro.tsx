'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { registrarse, type EstadoForm } from '@/app/acciones-auth';
import { Boton, Campo } from '@/components/ui';

const inicial: EstadoForm = {};

/**
 * Formulario de registro (client). Las provincias llegan por prop desde el
 * server component: así no importamos el barrel de `@trucazo/shared` en el
 * cliente (arrastraría `token.ts`, que usa crypto de Node y sólo va en server).
 */
export function FormRegistro({ provincias }: { provincias: Record<string, string> }) {
  const [estado, accion, pendiente] = useActionState(registrarse, inicial);

  return (
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

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-tinta-200">Provincia</span>
        <select
          name="province"
          required
          defaultValue=""
          className={`h-11 rounded-xl border bg-noche-800/80 px-3 text-[15px] text-tinta-50 focus:border-oro-500 ${
            estado.campo === 'province' ? 'border-canto-500' : ''
          }`}
        >
          <option value="" disabled>
            Elegí tu provincia
          </option>
          {Object.entries(provincias).map(([code, nombre]) => (
            <option key={code} value={code}>
              {nombre}
            </option>
          ))}
        </select>
        {estado.campo === 'province' && (
          <span role="alert" className="text-sm text-canto-400">
            {estado.error}
          </span>
        )}
      </label>

      <label className="flex items-start gap-2.5 text-sm text-tinta-300">
        <input
          name="acceptedTerms"
          type="checkbox"
          required
          className="mt-0.5 h-4 w-4 rounded border-noche-600 bg-noche-800 accent-oro-500"
        />
        <span>
          Soy mayor de 18 años y acepto los{' '}
          <Link href="/terminos" target="_blank" className="text-oro-400 hover:text-oro-500">
            Términos
          </Link>{' '}
          y la{' '}
          <Link href="/privacidad" target="_blank" className="text-oro-400 hover:text-oro-500">
            Política de Privacidad
          </Link>
          .
        </span>
      </label>

      {estado.error && !estado.campo && (
        <p role="alert" className="text-sm text-canto-400">
          {estado.error}
        </p>
      )}

      <Boton type="submit" tamaño="lg" disabled={pendiente} className="mt-1">
        {pendiente ? 'Creando…' : 'Crear cuenta y jugar'}
      </Boton>
    </form>
  );
}
