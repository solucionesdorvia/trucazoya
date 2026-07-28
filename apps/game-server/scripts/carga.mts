/**
 * Prueba de carga de sockets. Abre N conexiones concurrentes al game-server
 * con tokens válidos y mide latencia de conexión y tasa de éxito.
 *
 * Uso:
 *   GAME_TOKEN_SECRET=... GAME_SERVER_URL=http://localhost:4000 \
 *     pnpm --filter @trucazo/game-server exec tsx scripts/carga.mts 200
 *
 * El número es la cantidad de conexiones (default 100).
 */

import { io } from 'socket.io-client';
import { emitirTokenPartida } from '@trucazo/shared';

const N = Number(process.argv[2] ?? 100);
const URL = process.env.GAME_SERVER_URL ?? 'http://localhost:4000';
const SECRET = process.env.GAME_TOKEN_SECRET;

if (!SECRET) {
  console.error('Falta GAME_TOKEN_SECRET');
  process.exit(1);
}

interface Resultado {
  ok: boolean;
  ms: number;
}

function conectar(i: number): Promise<Resultado> {
  const token = emitirTokenPartida({ userId: `carga_${i}`, username: `carga_${i}` }, SECRET!);
  const inicio = Date.now();
  return new Promise((resolve) => {
    const socket = io(URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
      timeout: 10000,
    });
    socket.on('connect', () => {
      resolve({ ok: true, ms: Date.now() - inicio });
      // Mantener abierta un rato para simular presencia y liberar al final.
      setTimeout(() => socket.close(), 2000);
    });
    socket.on('connect_error', () => {
      resolve({ ok: false, ms: Date.now() - inicio });
      socket.close();
    });
  });
}

function percentil(valores: number[], p: number): number {
  if (valores.length === 0) return 0;
  const orden = [...valores].sort((a, b) => a - b);
  return orden[Math.min(orden.length - 1, Math.floor((p / 100) * orden.length))]!;
}

async function main() {
  console.log(`Abriendo ${N} conexiones a ${URL}…`);
  const inicio = Date.now();
  const resultados = await Promise.all(Array.from({ length: N }, (_, i) => conectar(i)));
  const total = Date.now() - inicio;

  const ok = resultados.filter((r) => r.ok);
  const latencias = ok.map((r) => r.ms);
  console.log('\n── Resultado ──────────────────────────');
  console.log(`Conexiones OK:   ${ok.length}/${N}`);
  console.log(`Tiempo total:    ${total} ms`);
  console.log(`Latencia p50:    ${percentil(latencias, 50)} ms`);
  console.log(`Latencia p95:    ${percentil(latencias, 95)} ms`);
  console.log(`Latencia máx:    ${Math.max(0, ...latencias)} ms`);
  console.log(`Throughput:      ${Math.round((ok.length / total) * 1000)} conexiones/s`);

  // Damos tiempo a que cierren y salimos.
  setTimeout(() => process.exit(ok.length === N ? 0 : 1), 2500);
}

main();
