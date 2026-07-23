'use server';

/**
 * Server Actions de autenticación: capa fina sobre `lib/cuentas` (lógica) y
 * `lib/session` (cookies). Toda validación ocurre en el servidor — el cliente
 * nunca decide si un registro o login es válido.
 */

import { redirect } from 'next/navigation';
import { loginSchema, registerSchema } from '@trucazo/shared';
import { autenticar, crearCuenta, crearInvitado } from '@/lib/cuentas';
import { createSession, destroySession } from '@/lib/session';

export interface EstadoForm {
  error?: string;
  campo?: string;
}

export async function registrarse(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const parsed = registerSchema.safeParse({
    username: String(formData.get('username') ?? ''),
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: issue?.message ?? 'Datos inválidos', campo: String(issue?.path[0] ?? '') };
  }

  const res = await crearCuenta(parsed.data);
  if (!res.ok) return { error: res.error, campo: res.campo };

  await createSession(res.userId);
  redirect('/inicio');
}

export async function ingresar(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const parsed = loginSchema.safeParse({
    emailOrUsername: String(formData.get('emailOrUsername') ?? ''),
    password: String(formData.get('password') ?? ''),
  });
  if (!parsed.success) return { error: 'Completá usuario y contraseña' };

  const res = await autenticar(parsed.data.emailOrUsername, parsed.data.password);
  if (!res.ok) return { error: res.error };

  await createSession(res.userId);
  redirect('/inicio');
}

export async function salir(): Promise<void> {
  await destroySession();
  redirect('/');
}

/** Crea una cuenta de invitado para jugar sin registrarse (sin apuestas). */
export async function jugarComoInvitado(): Promise<void> {
  const { userId } = await crearInvitado();
  await createSession(userId);
  redirect('/inicio');
}
