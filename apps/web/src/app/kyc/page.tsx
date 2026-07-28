import { redirect } from 'next/navigation';
import { estadoKyc } from '@trucazo/economia';
import { Encabezado } from '@/components/Encabezado';
import { FormKyc } from '@/components/FormKyc';
import { Panel } from '@/components/ui';
import { getSessionUser } from '@/lib/session';

export const metadata = { title: 'Verificación de identidad' };

export default async function Kyc() {
  const user = await getSessionUser();
  if (!user) redirect('/ingresar');

  const estado = await estadoKyc(user.id);

  return (
    <>
      <Encabezado user={user} />
      <main id="contenido" className="mx-auto max-w-xl px-5 py-8">
        <h1 className="text-2xl font-bold tracking-tight">Verificación de identidad</h1>
        <p className="mt-1.5 text-sm text-tinta-400">
          Necesaria para poder retirar. Es un requisito legal antilavado.
        </p>

        <div className="mt-6">
          {estado === 'APPROVED' ? (
            <Panel>
              <p className="font-medium text-emerald-300">✓ Tu identidad está verificada.</p>
              <p className="mt-1 text-sm text-tinta-400">Ya podés retirar desde tu billetera.</p>
            </Panel>
          ) : estado === 'PENDING' ? (
            <Panel>
              <p className="font-medium text-oro-300">⏳ Tu verificación está en revisión.</p>
              <p className="mt-1 text-sm text-tinta-400">Te avisamos cuando la resolvamos.</p>
            </Panel>
          ) : (
            <>
              {estado === 'REJECTED' && (
                <Panel className="mb-4">
                  <p className="font-medium text-canto-400">
                    Tu verificación anterior fue rechazada. Podés reenviarla con los datos
                    correctos.
                  </p>
                </Panel>
              )}
              <FormKyc />
            </>
          )}
        </div>
      </main>
    </>
  );
}
