import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Trucazo — Truco Argentino online', template: '%s · Trucazo' },
  description:
    'Jugá al Truco Argentino online contra amigos o rivales de todo el país. Salas privadas, torneos, ranking y partidas en tiempo real.',
  applicationName: 'Trucazo',
};

export const viewport: Viewport = {
  themeColor: '#0b0d12',
  width: 'device-width',
  initialScale: 1,
  // Permite zoom: bloquearlo es una barrera de accesibilidad.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-oro-500 focus:px-4 focus:py-2 focus:font-semibold focus:text-noche-950"
        >
          Saltar al contenido
        </a>
        {children}
      </body>
    </html>
  );
}
