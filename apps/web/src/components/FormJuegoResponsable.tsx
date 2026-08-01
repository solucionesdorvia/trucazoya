'use client';

import { useActionState, useState } from 'react';
import {
  autoexcluirAccion,
  guardarLimitesAccion,
  type EstadoRG,
} from '@/app/juego-responsable/acciones';
import { Boton, Panel } from '@/components/ui';

const inicial: EstadoRG = {};

const claseInput =
  'mt-1 h-11 w-full rounded-xl border border-noche-700 bg-noche-800/80 px-3.5 text-tinta-50 placeholder:text-tinta-600 focus:border-oro-500';

function CampoTope({
  name,
  label,
  ayuda,
  valor,
}: {
  name: string;
  label: string;
  ayuda: string;
  valor: number | null;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-tinta-200">{label}</span>
      <input
        name={name}
        type="number"
        min={0}
        defaultValue={valor ?? ''}
        placeholder="Sin límite"
        className={claseInput}
      />
      <span className="mt-1 block text-xs text-tinta-500">{ayuda}</span>
    </label>
  );
}

export function FormJuegoResponsable({
  limites,
  exclusion,
}: {
  limites: {
    dailyDepositMax: number | null;
    weeklyDepositMax: number | null;
    dailyLossMax: number | null;
    sessionMinutesMax: number | null;
  };
  exclusion: { kind: string; until: string | null } | null;
}) {
  const [estadoLim, accionLim, pendLim] = useActionState(guardarLimitesAccion, inicial);
  const [estadoExc, accionExc, pendExc] = useActionState(autoexcluirAccion, inicial);

  if (exclusion) {
    return (
      <Panel>
        <h3 className="font-semibold text-canto-400">Estás autoexcluido</h3>
        <p className="mt-1 text-sm text-tinta-300">
          {exclusion.kind === 'PERMANENT'
            ? 'Tu autoexclusión es permanente. No podés cargar ni apostar.'
            : `Tu autoexclusión vence el ${exclusion.until}. No podés cargar ni apostar hasta entonces.`}
        </p>
        <p className="mt-3 text-xs text-tinta-500">
          Si necesitás ayuda con tu juego, contactá a Juego Responsable de tu provincia o a la línea
          nacional 0800-333-0333.
        </p>
      </Panel>
    );
  }

  const [tipo, setTipo] = useState('TEMPORARY');
  const [palabra, setPalabra] = useState('');
  const habilitado = tipo !== 'PERMANENT' || palabra.trim().toUpperCase() === 'PERMANENTE';

  return (
    <div className="flex flex-col gap-5">
      <Panel>
        <h3 className="font-semibold text-tinta-50">Mis límites</h3>
        <p className="mt-1 text-sm text-tinta-400">
          Ponete topes para cuidar tu juego. Los aplica el sistema automáticamente.
        </p>
        <form action={accionLim} className="mt-4 grid gap-4 sm:grid-cols-2">
          <CampoTope
            name="dailyDepositMax"
            label="Carga máxima por día"
            ayuda="Monedas que podés cargar cada 24 h."
            valor={limites.dailyDepositMax}
          />
          <CampoTope
            name="weeklyDepositMax"
            label="Carga máxima por semana"
            ayuda="Tope de carga cada 7 días."
            valor={limites.weeklyDepositMax}
          />
          <CampoTope
            name="dailyLossMax"
            label="Pérdida máxima por día"
            ayuda="Al alcanzarla, no podés seguir apostando ese día."
            valor={limites.dailyLossMax}
          />
          <CampoTope
            name="sessionMinutesMax"
            label="Recordatorio de tiempo (min)"
            ayuda="Te avisamos al superar ese tiempo de juego."
            valor={limites.sessionMinutesMax}
          />
          <div className="sm:col-span-2 flex items-center gap-3">
            <Boton type="submit" disabled={pendLim}>
              {pendLim ? 'Guardando…' : 'Guardar límites'}
            </Boton>
            {estadoLim.ok && <span className="text-sm text-emerald-400">{estadoLim.ok}</span>}
            {estadoLim.error && <span className="text-sm text-canto-400">{estadoLim.error}</span>}
          </div>
        </form>
      </Panel>

      <Panel>
        <h3 className="font-semibold text-tinta-50">Autoexclusión</h3>
        <p className="mt-1 text-sm text-tinta-400">
          Bloqueá tu cuenta para cargar y apostar por un tiempo. Es inmediato y no se puede revertir
          antes de que venza.
        </p>
        <form action={accionExc} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1">
            <span className="block text-sm font-medium text-tinta-200">Tipo</span>
            <select
              name="tipo"
              className={claseInput}
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
            >
              <option value="TEMPORARY">Temporal</option>
              <option value="PERMANENT">Permanente</option>
            </select>
          </label>
          {tipo === 'TEMPORARY' ? (
            <label className="flex-1">
              <span className="block text-sm font-medium text-tinta-200">Días</span>
              <input name="dias" type="number" min={1} defaultValue={7} className={claseInput} />
            </label>
          ) : (
            <input type="hidden" name="dias" value="0" />
          )}
          <Boton type="submit" variante="peligro" disabled={pendExc || !habilitado}>
            {pendExc ? 'Aplicando…' : 'Autoexcluirme'}
          </Boton>
        </form>

        {/* La acción más irreversible del producto: para la permanente hay que
            escribir la palabra, y el teléfono de ayuda va acá mismo. */}
        {tipo === 'PERMANENT' && (
          <div className="mt-4 rounded-xl border border-canto-500/50 bg-canto-500/10 p-4">
            <p className="text-sm font-semibold text-canto-300">
              La autoexclusión permanente no se puede deshacer nunca.
            </p>
            <p className="mt-1 text-sm text-tinta-200">
              Vas a perder el acceso a cargar fichas y a jugar por fichas para siempre. Si te quedan
              fichas, pedí el retiro <strong>antes</strong> de confirmar.
            </p>
            <label className="mt-3 block">
              <span className="block text-sm font-medium text-tinta-200">
                Escribí <strong>PERMANENTE</strong> para habilitar el botón
              </span>
              <input
                value={palabra}
                onChange={(e) => setPalabra(e.target.value)}
                className={claseInput}
                placeholder="PERMANENTE"
                autoComplete="off"
              />
            </label>
            <p className="mt-3 text-sm text-tinta-300">
              ¿Querés hablar con alguien? Línea gratuita de juego responsable:{' '}
              <strong className="text-tinta-50">0800-333-0333</strong>
            </p>
          </div>
        )}
        {estadoExc.error && <p className="mt-2 text-sm text-canto-400">{estadoExc.error}</p>}
      </Panel>
    </div>
  );
}
