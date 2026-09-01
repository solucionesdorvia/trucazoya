'use client';

import { useActionState, useEffect, useId, useState } from 'react';
import { moverFichas, type EstadoCarga } from './acciones';
import { limpiarMonto } from '@/lib/monto';

const inicial: EstadoCarga = {};

const ATAJOS = [1000, 2500, 5000, 10000, 50000];

export function FormularioFichas({ usuario, saldo }: { usuario: string; saldo: number }) {
  const [estado, accion, pendiente] = useActionState(moverFichas, inicial);
  const [montoTexto, setMontoTexto] = useState('');
  const [signo, setSigno] = useState<'cargar' | 'descontar'>('cargar');
  const [clave, setClave] = useState('');
  const idMonto = useId();
  const idNota = useId();

  // Clave de idempotencia por intento: si se toca dos veces, el ledger cuenta
  // el segundo envío como el mismo movimiento y no carga de nuevo. Se renueva
  // recién cuando el anterior terminó.
  useEffect(() => {
    setClave(crypto.randomUUID());
  }, [estado]);

  const monto = Number(montoTexto) || 0;
  const saldoVigente = estado.saldoNuevo ? Number(estado.saldoNuevo.replace(/\D/g, '')) : saldo;
  const queda = signo === 'cargar' ? saldoVigente + monto : saldoVigente - monto;
  const noAlcanza = signo === 'descontar' && monto > saldoVigente;
  const listo = monto > 0 && !noAlcanza && !pendiente;

  return (
    <form action={accion} className="mt-5">
      <input type="hidden" name="usuario" value={usuario} />
      <input type="hidden" name="idempotencyKey" value={clave} />
      <input type="hidden" name="signo" value={signo} />

      {/* Cargar o descontar. Es lo primero porque cambia el sentido de todo lo
          que sigue, incluido el número que se previsualiza abajo. */}
      <div
        role="radiogroup"
        aria-label="Qué hacer con las fichas"
        className="inline-flex rounded-xl border border-noche-700 bg-noche-900 p-1"
      >
        {(['cargar', 'descontar'] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={signo === v}
            onClick={() => setSigno(v)}
            className={`min-h-[40px] rounded-lg px-5 text-sm font-semibold transition-colors ${
              signo === v
                ? v === 'cargar'
                  ? 'bg-oro-500 text-noche-950'
                  : 'bg-canto-500 text-noche-950'
                : 'text-tinta-400 hover:text-tinta-100'
            }`}
          >
            {v === 'cargar' ? 'Cargar' : 'Descontar'}
          </button>
        ))}
      </div>

      <div className="mt-5">
        <label htmlFor={idMonto} className="text-sm font-medium text-tinta-200">
          Cuántas fichas
        </label>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-xl font-semibold text-oro-400">$</span>
          <input
            id={idMonto}
            name="monto"
            type="text"
            inputMode="numeric"
            autoFocus
            value={montoTexto}
            placeholder="0"
            onChange={(e) => setMontoTexto(limpiarMonto(e.target.value))}
            className="h-12 w-48 rounded-xl border border-noche-600 bg-noche-800/80 px-3.5 font-mono text-xl font-semibold text-tinta-50 placeholder:text-tinta-600 focus:border-oro-500"
          />
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          {ATAJOS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setMontoTexto(String(v))}
              className="min-h-[34px] rounded-lg border border-noche-600 px-3 text-sm text-tinta-300 transition-colors hover:border-noche-600 hover:text-tinta-50"
            >
              {v.toLocaleString('es-AR')}
            </button>
          ))}
        </div>
      </div>

      {/* La red de seguridad: antes de tocar plata se ve en cuánto queda. */}
      {monto > 0 && (
        <p
          aria-live="polite"
          className={`mt-4 rounded-xl border px-3.5 py-3 text-sm ${
            noAlcanza
              ? 'border-canto-500 bg-canto-500/10 text-canto-300'
              : 'border-noche-700 bg-noche-900/60 text-tinta-300'
          }`}
        >
          {noAlcanza ? (
            <>
              No alcanza: tiene{' '}
              <strong className="font-mono">{saldoVigente.toLocaleString('es-AR')}</strong> y querés
              descontarle <strong className="font-mono">{monto.toLocaleString('es-AR')}</strong>.
            </>
          ) : (
            <>
              <span className="font-mono">{saldoVigente.toLocaleString('es-AR')}</span>
              <span className="mx-2 text-tinta-500">→</span>
              <strong
                className={`font-mono text-base ${
                  signo === 'cargar' ? 'text-emerald-400' : 'text-canto-300'
                }`}
              >
                {queda.toLocaleString('es-AR')}
              </strong>
              <span className="ml-2 text-tinta-500">
                ({signo === 'cargar' ? '+' : '−'}
                {monto.toLocaleString('es-AR')})
              </span>
            </>
          )}
        </p>
      )}

      <div className="mt-5">
        <label htmlFor={idNota} className="text-sm font-medium text-tinta-200">
          Nota
        </label>
        <input
          id={idNota}
          name="nota"
          type="text"
          maxLength={140}
          placeholder="transferencia, pago MP, corrección…"
          className="mt-1.5 h-11 w-full rounded-xl border border-noche-600 bg-noche-800/80 px-3.5 text-[15px] text-tinta-50 placeholder:text-tinta-600 focus:border-oro-500"
        />
        <p className="mt-1.5 text-xs text-tinta-500">
          Queda guardada con el movimiento. Dentro de un mes va a ser lo único que explique por qué
          se movió esta plata.
        </p>
      </div>

      <button
        type="submit"
        disabled={!listo}
        className={`mt-5 inline-flex h-12 min-w-[13rem] items-center justify-center rounded-xl px-6 font-bold transition-opacity disabled:cursor-not-allowed disabled:opacity-40 ${
          signo === 'cargar'
            ? 'bg-oro-500 text-noche-950 shadow-[0_4px_14px_-4px_rgba(232,176,75,.5)] hover:opacity-90'
            : 'bg-canto-500 text-noche-950 hover:opacity-90'
        }`}
      >
        {pendiente
          ? 'Registrando…'
          : signo === 'cargar'
            ? `Cargar ${monto > 0 ? monto.toLocaleString('es-AR') : ''}`.trim()
            : `Descontar ${monto > 0 ? monto.toLocaleString('es-AR') : ''}`.trim()}
      </button>

      {estado.error && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-canto-500 bg-canto-500/10 px-3.5 py-3 text-sm text-canto-300"
        >
          {estado.error}
        </p>
      )}
      {estado.ok && (
        <p
          role="status"
          className="mt-4 rounded-xl border border-emerald-700/60 bg-emerald-950/40 px-3.5 py-3 text-sm text-emerald-300"
        >
          {estado.ok}
          {estado.saldoNuevo && (
            <>
              {' '}
              Quedó en <strong className="font-mono">{estado.saldoNuevo}</strong>.
            </>
          )}
        </p>
      )}
    </form>
  );
}
