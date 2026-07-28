'use client';

import { useActionState } from 'react';
import { enviarKycAccion, type EstadoKyc } from '@/app/kyc/acciones';
import { Boton, Panel } from '@/components/ui';

const inicial: EstadoKyc = {};
const claseInput =
  'mt-1 h-11 w-full rounded-xl border border-noche-700 bg-noche-800/80 px-3.5 text-tinta-50 placeholder:text-tinta-600 focus:border-oro-500';

export function FormKyc() {
  const [estado, accion, pendiente] = useActionState(enviarKycAccion, inicial);

  if (estado.ok) {
    return (
      <Panel>
        <p className="font-medium text-emerald-300">✓ {estado.ok}</p>
      </Panel>
    );
  }

  return (
    <Panel>
      <form action={accion} className="flex flex-col gap-4">
        <label className="block">
          <span className="block text-sm font-medium text-tinta-200">Nombre y apellido</span>
          <input
            name="fullName"
            required
            placeholder="Como figura en tu documento"
            className={claseInput}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="block text-sm font-medium text-tinta-200">Tipo</span>
            <select name="docType" className={claseInput} defaultValue="DNI">
              <option value="DNI">DNI</option>
              <option value="PASSPORT">Pasaporte</option>
            </select>
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-tinta-200">Número</span>
            <input name="docNumber" required placeholder="00.000.000" className={claseInput} />
          </label>
        </div>
        <label className="block">
          <span className="block text-sm font-medium text-tinta-200">
            Foto del documento (link, opcional)
          </span>
          <input name="docImageUrl" placeholder="https://…" className={claseInput} />
          <span className="mt-1 block text-xs text-tinta-500">
            Si el operador habilita subida de archivos, va acá.
          </span>
        </label>

        {estado.error && <p className="text-sm text-canto-400">{estado.error}</p>}
        <Boton type="submit" disabled={pendiente}>
          {pendiente ? 'Enviando…' : 'Enviar verificación'}
        </Boton>
      </form>
    </Panel>
  );
}
