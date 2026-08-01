'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { crearSala, type EstadoSala } from '../acciones';
import { Boton, Panel } from '@/components/ui';

const inicial: EstadoSala = {};

export default function CrearSala() {
  const [estado, accion, pendiente] = useActionState(crearSala, inicial);
  const [modo, setModo] = useState('CASUAL_1V1');
  const [puntos, setPuntos] = useState(30);
  const [apuesta, setApuesta] = useState(0);

  return (
    <div className="mx-auto max-w-lg px-5 py-8">
      <Link href="/inicio" className="text-sm text-tinta-400 hover:text-tinta-200">
        ← Volver
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">Crear sala</h1>
      <p className="mt-1.5 text-tinta-400">Configurá la mesa y compartí el código.</p>

      <form action={accion} className="mt-6 flex flex-col gap-5">
        <Panel>
          <label htmlFor="name" className="text-sm font-medium text-tinta-200">
            Nombre de la sala
          </label>
          <input
            id="name"
            name="name"
            maxLength={40}
            placeholder="La mesa de los pibes"
            className="mt-1.5 h-11 w-full rounded-xl border bg-noche-800/80 px-3.5 text-[15px] text-tinta-50 placeholder:text-tinta-600 focus:border-oro-500"
          />
        </Panel>

        <Panel>
          <span className="text-sm font-medium text-tinta-200">Modo</span>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {[
              { v: 'CASUAL_1V1', t: '1 vs 1', d: 'Mano a mano' },
              { v: 'CASUAL_2V2', t: '2 vs 2', d: 'Por equipos' },
            ].map((o) => (
              <label
                key={o.v}
                className={`cursor-pointer rounded-xl border p-3 transition-colors ${
                  modo === o.v
                    ? 'border-oro-500 bg-oro-500/10'
                    : 'border-noche-600 hover:bg-noche-800'
                }`}
              >
                <input
                  type="radio"
                  name="mode"
                  value={o.v}
                  checked={modo === o.v}
                  onChange={() => setModo(o.v)}
                  className="sr-only"
                />
                <div className="font-semibold text-tinta-50">{o.t}</div>
                <div className="text-xs text-tinta-400">{o.d}</div>
              </label>
            ))}
          </div>
        </Panel>

        <Panel>
          <span className="text-sm font-medium text-tinta-200">Partida a</span>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {[15, 30].map((p) => (
              <label
                key={p}
                className={`cursor-pointer rounded-xl border p-3 text-center transition-colors ${
                  puntos === p
                    ? 'border-oro-500 bg-oro-500/10'
                    : 'border-noche-600 hover:bg-noche-800'
                }`}
              >
                <input
                  type="radio"
                  name="pointsToWin"
                  value={p}
                  checked={puntos === p}
                  onChange={() => setPuntos(p)}
                  className="sr-only"
                />
                <div className="font-semibold text-tinta-50">{p} puntos</div>
                <div className="text-xs text-tinta-400">{p === 15 ? 'Rápida' : 'Completa'}</div>
              </label>
            ))}
          </div>
        </Panel>

        <Panel className="flex flex-col gap-3">
          <Interruptor
            name="florEnabled"
            defaultChecked
            label="Con flor"
            desc="Se juega flor y contraflor"
          />
          <Interruptor
            name="isPrivate"
            label="Sala privada"
            desc="No aparece en el navegador público: se entra con código"
          />
        </Panel>

        {/* Apuesta: el server ya validaba betAmount contra la wallet, pero no
            existía ningún control que lo mandara (siempre iba en 0). */}
        <Panel>
          <p className="font-medium text-tinta-50">Se juega por</p>
          <p className="mt-0.5 text-sm text-tinta-400">
            Las fichas se descuentan al repartir la primera mano. El que gana se lleva las dos
            partes.
          </p>
          <input type="hidden" name="betAmount" value={apuesta} />
          <div className="mt-3 flex flex-wrap gap-2">
            {[0, 100, 500, 1000, 5000].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setApuesta(v)}
                aria-pressed={apuesta === v}
                className={`min-h-[44px] rounded-xl border px-4 text-sm font-semibold transition-colors ${
                  apuesta === v
                    ? 'border-oro-500 bg-oro-500/20 text-oro-300'
                    : 'border-noche-600 text-tinta-300 hover:border-noche-600 hover:text-tinta-50'
                }`}
              >
                {v === 0 ? 'Sin fichas' : `${v.toLocaleString('es-AR')} fichas`}
              </button>
            ))}
          </div>
          {apuesta > 0 && (
            <p className="mt-3 rounded-lg bg-oro-500/10 px-3 py-2 text-sm text-oro-200">
              Ponés <strong>{apuesta.toLocaleString('es-AR')}</strong> fichas. Si ganás te llevás{' '}
              <strong>{(apuesta * 2).toLocaleString('es-AR')}</strong>.
            </p>
          )}
        </Panel>

        {estado.error && (
          <p role="alert" className="text-sm text-canto-400">
            {estado.error}
          </p>
        )}

        <Boton type="submit" tamaño="lg" disabled={pendiente}>
          {pendiente ? 'Creando…' : 'Crear sala'}
        </Boton>
      </form>
    </div>
  );
}

function Interruptor({
  name,
  label,
  desc,
  defaultChecked,
  checked,
  onChange,
}: {
  name: string;
  label: string;
  desc: string;
  defaultChecked?: boolean;
  checked?: boolean;
  onChange?: (v: boolean) => void;
}) {
  const controlado = checked !== undefined;
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4">
      <span>
        <span className="block font-medium text-tinta-50">{label}</span>
        <span className="block text-xs text-tinta-400">{desc}</span>
      </span>
      <input
        type="checkbox"
        name={name}
        defaultChecked={controlado ? undefined : defaultChecked}
        checked={controlado ? checked : undefined}
        onChange={controlado ? (e) => onChange?.(e.target.checked) : undefined}
        className="h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full bg-noche-600 transition-colors checked:bg-oro-500 relative before:absolute before:left-0.5 before:top-0.5 before:h-5 before:w-5 before:rounded-full before:bg-white before:transition-transform checked:before:translate-x-5"
      />
    </label>
  );
}
