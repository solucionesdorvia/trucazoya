/** Primitivos de UI de Trucazo. Accesibles, con foco visible y áreas táctiles ≥44px. */

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

type Variante = 'primario' | 'secundario' | 'fantasma' | 'peligro';
type Tamaño = 'sm' | 'md' | 'lg';

const VARIANTES: Record<Variante, string> = {
  primario:
    'bg-oro-500 text-noche-950 hover:bg-oro-400 active:bg-oro-600 font-semibold shadow-[0_4px_14px_-4px_rgba(232,176,75,.5)]',
  secundario: 'bg-noche-700 text-tinta-50 hover:bg-noche-600 border border-noche-600',
  fantasma: 'bg-transparent text-tinta-200 hover:bg-noche-800 hover:text-tinta-50',
  peligro: 'bg-canto-500 text-white hover:bg-canto-400 active:bg-canto-600 font-semibold',
};

const TAMAÑOS: Record<Tamaño, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-5 text-[15px]',
  lg: 'h-14 px-7 text-base',
};

export function Boton({
  variante = 'primario',
  tamaño = 'md',
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: Variante;
  tamaño?: Tamaño;
}) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTES[variante]} ${TAMAÑOS[tamaño]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Campo({
  label,
  error,
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  const id = props.id ?? props.name;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-tinta-200">
        {label}
      </label>
      <input
        id={id}
        className={`h-11 rounded-xl border bg-noche-800/80 px-3.5 text-[15px] text-tinta-50 placeholder:text-tinta-600 focus:border-oro-500 ${error ? 'border-canto-500' : ''} ${className}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
      />
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-canto-400">
          {error}
        </p>
      )}
    </div>
  );
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`panel p-5 ${className}`}>{children}</div>;
}

/** Píldora de estado / etiqueta. */
export function Pildora({
  children,
  tono = 'neutro',
}: {
  children: ReactNode;
  tono?: 'neutro' | 'oro' | 'verde' | 'rojo';
}) {
  const tonos = {
    neutro: 'bg-noche-700 text-tinta-200',
    oro: 'bg-oro-500/15 text-oro-400 border border-oro-500/30',
    verde: 'bg-pano-600/25 text-emerald-300 border border-pano-600/40',
    rojo: 'bg-canto-500/15 text-canto-400 border border-canto-500/30',
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${tonos[tono]}`}
    >
      {children}
    </span>
  );
}

/** Marca "La Noche": T serif en placa noche + wordmark dorado vectorizado. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <img src="/icono-lanoche.svg" alt="" width={size} height={size} aria-hidden="true" />
      <img
        src="/logo-lanoche.svg"
        alt="Trucazo"
        style={{ height: Math.round(size * 0.82), width: 'auto' }}
      />
    </span>
  );
}
