'use client';

import { useActionState, useEffect, useState } from 'react';
import { acreditar, type EstadoCajero } from '@/app/cajero/acciones';
import { Boton, Panel } from '@/components/ui';

const inicial: EstadoCajero = {};

export function FormAcreditar() {
  const [estado, accion, pendiente] = useActionState(acreditar, inicial);
  // Clave de idempotencia por intento: si el cajero hace doble clic o se le
  // corta la conexión y reintenta, el servidor acredita UNA sola vez.
  const [clave, setClave] = useState('');

  useEffect(() => setClave(crypto.randomUUID()), []);
  // Después de una carga exitosa se renueva, para que la próxima sea otra.
  useEffect(() => {
    if (estado.ok) setClave(crypto.randomUUID());
  }, [estado.ok]);

  return (
    <Panel>
      <form action={accion} className="flex flex-col gap-3">
        <input type="hidden" name="idempotencyKey" value={clave} />
        <div className="grid gap-3 sm:grid-cols-3">
          <label>
            <span className="block text-sm font-medium text-tinta-200">Usuario</span>
            <input
              name="usuario"
              required
              placeholder="elmatador"
              autoComplete="off"
              className="mt-1 h-11 w-full rounded-xl border bg-noche-800/80 px-3.5 text-tinta-50 placeholder:text-tinta-600 focus:border-oro-500"
            />
          </label>
          <label>
            <span className="block text-sm font-medium text-tinta-200">Monto</span>
            <input
              name="monto"
              type="number"
              min={1}
              required
              placeholder="1000"
              className="mt-1 h-11 w-full rounded-xl border bg-noche-800/80 px-3.5 text-tinta-50 placeholder:text-tinta-600 focus:border-oro-500"
            />
          </label>
          <label>
            <span className="block text-sm font-medium text-tinta-200">Referencia</span>
            <input
              name="referencia"
              placeholder="transferencia #123"
              autoComplete="off"
              className="mt-1 h-11 w-full rounded-xl border bg-noche-800/80 px-3.5 text-tinta-50 placeholder:text-tinta-600 focus:border-oro-500"
            />
          </label>
        </div>

        <Boton type="submit" disabled={pendiente || !clave} className="sm:self-start">
          {pendiente ? 'Acreditando…' : 'Acreditar monedas'}
        </Boton>
      </form>

      {estado.error && (
        <p role="alert" className="mt-3 text-sm text-canto-400">
          {estado.error}
        </p>
      )}
      {estado.ok && (
        <p role="status" className="mt-3 text-sm text-emerald-400">
          ✓ {estado.ok}
        </p>
      )}
    </Panel>
  );
}
