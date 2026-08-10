/**
 * Observabilidad del game-server.
 *
 * El problema que resuelve: los errores más caros del sistema —una
 * liquidación que falla, eventos que no se persisten, apuestas que quedan
 * colgadas— sólo escribían a `console.error` y el flujo seguía como si nada.
 * Si un jugador perdía plata a las 3am, nadie se enteraba nunca.
 *
 * Acá se centralizan tres cosas:
 *  1. Log estructurado (JSON) con contexto — grepeable por matchId/userId/betId.
 *  2. `alerta()` para lo que un humano TIENE que mirar, con envío opcional a
 *     un webhook (Slack/Discord/lo que sea) si está configurado.
 *  3. Señales de negocio consultables: apuestas colgadas y partidas viejas.
 */

import { prisma } from '@trucazo/db';

export type Severidad = 'info' | 'aviso' | 'critico';

/** Contexto que acompaña a cada línea: sirve para rastrear un caso puntual. */
export interface Contexto {
  matchId?: string;
  betId?: string;
  userId?: string;
  code?: string;
  [k: string]: unknown;
}

const WEBHOOK = process.env.ALERTAS_WEBHOOK_URL;
const ENTORNO = process.env.NODE_ENV ?? 'development';

/** Log estructurado: una línea JSON por evento, con timestamp y contexto. */
export function log(nivel: Severidad, evento: string, ctx: Contexto = {}): void {
  const linea = JSON.stringify({
    ts: new Date().toISOString(),
    nivel,
    evento,
    entorno: ENTORNO,
    ...ctx,
  });
  if (nivel === 'critico') console.error(linea);
  else if (nivel === 'aviso') console.warn(linea);
  else console.log(linea);
}

/**
 * Algo que un humano tiene que mirar. Además del log, lo manda al webhook si
 * hay uno configurado. Nunca lanza: una alerta que rompe el flujo sería peor
 * que la alerta misma.
 */
export async function alerta(evento: string, ctx: Contexto = {}): Promise<void> {
  log('critico', evento, ctx);
  if (!WEBHOOK) return;
  try {
    const detalle = Object.entries(ctx)
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
      .join(' · ');
    await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: `🚨 [${ENTORNO}] ${evento}\n${detalle}` }),
      signal: AbortSignal.timeout(4000),
    });
  } catch (e) {
    console.error(JSON.stringify({ evento: 'alerta.envio_fallido', causa: String(e) }));
  }
}

/**
 * Señales de negocio que conviene mirar seguido. Son las que delatan plata
 * congelada: una apuesta reservada hace rato o una partida que no cierra.
 */
export async function señalesDeSalud(): Promise<{
  apuestasColgadas: number;
  partidasColgadas: number;
  retirosPendientes: number;
  problemas: string[];
}> {
  const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000);
  const [apuestasColgadas, partidasColgadas, retirosPendientes] = await Promise.all([
    // Reservada hace más de una hora: ninguna partida dura tanto.
    prisma.bet.count({ where: { state: 'RESERVED', createdAt: { lt: haceUnaHora } } }),
    prisma.match.count({ where: { state: 'IN_PROGRESS', startedAt: { lt: haceUnaHora } } }),
    prisma.withdrawalRequest.count({ where: { state: { in: ['PENDING', 'RESERVED'] } } }),
  ]);

  const problemas: string[] = [];
  if (apuestasColgadas > 0)
    problemas.push(`${apuestasColgadas} apuesta(s) reservadas hace más de 1h: plata congelada`);
  if (partidasColgadas > 0)
    problemas.push(`${partidasColgadas} partida(s) en curso hace más de 1h`);

  return { apuestasColgadas, partidasColgadas, retirosPendientes, problemas };
}

/**
 * Vigilancia periódica: si aparecen señales malas, alerta una sola vez por
 * ciclo (no repite mientras el problema siga igual, para no inundar).
 */
export function vigilar(intervaloMs = 15 * 60 * 1000): () => void {
  let ultimoReporte = '';
  const tick = async () => {
    try {
      const s = await señalesDeSalud();
      const huella = s.problemas.join('|');
      if (s.problemas.length > 0 && huella !== ultimoReporte) {
        await alerta('salud.problemas_detectados', {
          problemas: s.problemas,
          apuestasColgadas: s.apuestasColgadas,
          partidasColgadas: s.partidasColgadas,
        });
      }
      ultimoReporte = huella;
    } catch (e) {
      log('aviso', 'salud.chequeo_fallido', { causa: String(e) });
    }
  };
  void tick();
  const id = setInterval(() => void tick(), intervaloMs);
  return () => clearInterval(id);
}
