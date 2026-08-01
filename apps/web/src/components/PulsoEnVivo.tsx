'use client';

/**
 * Pulso de la plataforma: cuánta gente hay jugando ahora mismo. El
 * game-server ya exponía /metricas y nadie lo consumía, así que la app se veía
 * muerta aunque hubiera partidas en curso.
 */

import { useEffect, useState } from 'react';

interface Metricas {
  usuariosConectados?: number;
  enColaMatchmaking?: number;
  salasActivas?: number;
}

export function PulsoEnVivo() {
  const [m, setM] = useState<Metricas | null>(null);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_GAME_SERVER_URL;
    if (!url) return;
    let vivo = true;
    const traer = async () => {
      try {
        const r = await fetch(`${url}/metricas`, { cache: 'no-store' });
        if (!r.ok) return;
        const d = (await r.json()) as Metricas;
        if (vivo) setM(d);
      } catch {
        /* el server puede estar caído: el pulso simplemente no se muestra */
      }
    };
    void traer();
    const id = setInterval(traer, 15_000);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, []);

  if (!m) return null;
  const conectados = m.usuariosConectados ?? 0;
  const enCola = m.enColaMatchmaking ?? 0;

  return (
    <p className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-sm text-emerald-300">
      <span
        aria-hidden="true"
        className="inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-400"
        style={{ boxShadow: '0 0 8px rgba(52,211,153,.9)' }}
      />
      {conectados === 0
        ? 'Sé el primero en abrir mesa'
        : `${conectados} ${conectados === 1 ? 'jugador conectado' : 'jugadores conectados'}`}
      {enCola > 0 && ` · ${enCola} buscando rival`}
    </p>
  );
}
