'use client';

import { useActionState } from 'react';
import { unirsePorCodigo, type EstadoSala } from '@/app/salas/acciones';
import { Boton } from './ui';

const inicial: EstadoSala = {};

export function UnirseConCodigo() {
  const [estado, accion, pendiente] = useActionState(unirsePorCodigo, inicial);

  return (
    <form action={accion} className="mt-3 flex gap-2">
      <input
        name="code"
        placeholder="ABC123"
        maxLength={6}
        required
        aria-label="Código de sala"
        className="h-11 w-full min-w-0 rounded-xl border bg-noche-800/80 px-3.5 text-center font-mono text-lg uppercase tracking-widest text-tinta-50 placeholder:text-tinta-600 focus:border-oro-500"
      />
      <Boton type="submit" disabled={pendiente}>
        {pendiente ? '…' : 'Entrar'}
      </Boton>
      {estado.error && (
        <p role="alert" className="sr-only">
          {estado.error}
        </p>
      )}
    </form>
  );
}
