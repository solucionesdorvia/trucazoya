'use client';

import { useEffect, useRef, useState } from 'react';
import type { MensajeChat } from './SalaVivo';

/** Frases rápidas: evitan el teclado en celular y filtran el spam. */
const FRASES = [
  '¡Buenas!',
  'Vamo arriba',
  'Son buenas',
  'Achicate',
  'Contame una',
  'Mazo tenés',
  'Uh, qué mano',
  'Bien ahí',
  'Revancha',
  '¡Gracias!',
];

export function Chat({
  mensajes,
  onEnviar,
  compacto,
}: {
  mensajes: MensajeChat[];
  onEnviar: (t: string) => void;
  compacto?: boolean;
}) {
  const [texto, setTexto] = useState('');
  const finRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    finRef.current?.scrollIntoView({ block: 'nearest' });
  }, [mensajes.length]);

  const enviar = (t: string) => {
    const limpio = t.trim();
    if (!limpio) return;
    onEnviar(limpio);
    setTexto('');
  };

  return (
    <div className="panel !p-3">
      <div
        className={`space-y-1 overflow-y-auto ${compacto ? 'max-h-20' : 'max-h-48'}`}
        role="log"
        aria-label="Chat de la sala"
        aria-live="polite"
      >
        {mensajes.length === 0 ? (
          <p className="text-xs text-tinta-600">Sin mensajes todavía.</p>
        ) : (
          mensajes.map((m, i) => (
            <p key={i} className="text-sm">
              <span className="font-medium text-oro-400">{m.de}</span>{' '}
              <span className="text-tinta-200">{m.texto}</span>
            </p>
          ))
        )}
        <div ref={finRef} />
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {FRASES.map((f) => (
          <button
            key={f}
            onClick={() => enviar(f)}
            className="rounded-full border border-noche-600 px-2.5 py-1 text-xs text-tinta-300 transition-colors hover:bg-noche-700 hover:text-tinta-50"
          >
            {f}
          </button>
        ))}
      </div>

      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          enviar(texto);
        }}
      >
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={200}
          placeholder="Escribí un mensaje…"
          aria-label="Mensaje"
          className="h-9 min-w-0 flex-1 rounded-lg border bg-noche-800/80 px-3 text-sm text-tinta-50 placeholder:text-tinta-600 focus:border-oro-500"
        />
        <button
          type="submit"
          className="rounded-lg bg-noche-700 px-3 text-sm text-tinta-200 hover:bg-noche-600"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}
