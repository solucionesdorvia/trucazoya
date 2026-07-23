/**
 * Emite el token corto que autentica el handshake del socket.
 *
 * La cookie de sesión es httpOnly y del origen de la web: el game-server no
 * puede leerla. Acá, ya autenticados, firmamos un token de vida corta que el
 * game-server sólo verifica. No lleva secretos ni permisos.
 */

import { NextResponse } from 'next/server';
import { emitirTokenPartida } from '@trucazo/shared';
import { getSessionUser } from '@/lib/session';

export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const secret = process.env.GAME_TOKEN_SECRET;
  if (!secret) {
    console.error('Falta GAME_TOKEN_SECRET');
    return NextResponse.json({ error: 'Servidor mal configurado' }, { status: 500 });
  }

  const token = emitirTokenPartida({ userId: user.id, username: user.displayName }, secret);
  return NextResponse.json({
    token,
    servidor: process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? 'http://localhost:4000',
    userId: user.id,
  });
}
