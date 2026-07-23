'use client';

import { useActionState } from 'react';
import { pedirRetiro, type EstadoRetiro } from '@/app/billetera/acciones';
import { Boton, Panel } from '@/components/ui';

const inicial: EstadoRetiro = {};

export function FormRetiro({
  cajeros,
  maximo,
}: {
  cajeros: Array<{ userId: string; nombre: string }>;
  maximo: number;
}) {
  const [estado, accion, pendiente] = useActionState(pedirRetiro, inicial);

  return (
    <Panel>
      <h3 className="font-semibold text-tinta-50">Pedir un retiro</h3>
      <p className="mt-1 text-sm text-tinta-400">
        El monto queda bloqueado hasta que el cajero te pague o rechace el pedido.
      </p>

      <form action={accion} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1">
          <span className="block text-sm font-medium text-tinta-200">Monto</span>
          <input
            name="monto"
            type="number"
            min={1}
            max={maximo}
            required
            placeholder="500"
            className="mt-1 h-11 w-full rounded-xl border bg-noche-800/80 px-3.5 text-tinta-50 placeholder:text-tinta-600 focus:border-oro-500"
          />
        </label>
        <label className="flex-1">
          <span className="block text-sm font-medium text-tinta-200">Cajero</span>
          <select
            name="cajero"
            required
            className="mt-1 h-11 w-full rounded-xl border bg-noche-800/80 px-3 text-tinta-50 focus:border-oro-500"
          >
            {cajeros.map((c) => (
              <option key={c.userId} value={c.userId}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <Boton type="submit" disabled={pendiente} variante="secundario">
          {pendiente ? 'Enviando…' : 'Pedir retiro'}
        </Boton>
      </form>

      {estado.error && (
        <p role="alert" className="mt-2 text-sm text-canto-400">
          {estado.error}
        </p>
      )}
      {estado.ok && (
        <p role="status" className="mt-2 text-sm text-emerald-400">
          {estado.ok}
        </p>
      )}
    </Panel>
  );
}
