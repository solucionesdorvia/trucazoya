/** Punto de entrada del proceso. Arranca el servidor y maneja el cierre limpio. */

import { prisma } from '@trucazo/db';
import { crearServidor } from './index.js';

const servidor = crearServidor();

servidor.escuchar().then((puerto) => {
  console.log(`🎴 Trucazo game-server escuchando en :${puerto}`);
});

for (const señal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(señal, async () => {
    console.log('\n▸ cerrando game-server…');
    await servidor.cerrar();
    await prisma.$disconnect();
    process.exit(0);
  });
}
