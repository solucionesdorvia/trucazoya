import path from 'node:path';
import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // El indicador flotante de dev de Next tapaba botones de la mesa en mobile.
  devIndicators: false,
  // Prisma no debe bundlearse: se requiere desde node_modules en runtime,
  // donde vive el binario del query engine.
  serverExternalPackages: ['@prisma/client', '.prisma/client'],
  // El build de producción usa otro directorio para no pisar el `.next` del dev
  // server (si se pisan, el dev queda con un mapa de chunks corrupto).
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  // El motor y los paquetes compartidos se distribuyen como TS: los transpila Next.
  transpilePackages: ['@trucazo/engine', '@trucazo/shared', '@trucazo/db'],
  // Hay lockfiles fuera del repo; fijamos la raíz del monorepo explícitamente.
  outputFileTracingRoot: path.join(import.meta.dirname, '../../'),

  webpack: (cfg) => {
    // Los paquetes internos usan imports ESM con extensión (`./cards.js`) que
    // en realidad apuntan a archivos `.ts`. Sin este alias el bundler no los
    // resuelve. Mantenerlo así deja los paquetes como ESM válido para Node.
    cfg.resolve.extensionAlias = {
      ...cfg.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };
    return cfg;
  },
};

export default config;
