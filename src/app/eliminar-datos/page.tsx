import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT, LegalPage, UPDATED } from "@/components/legal-page";

export const metadata: Metadata = { title: "Eliminación de datos" };

export default function DataDeletionPage() {
  return (
    <LegalPage title="Eliminación de datos" updated={UPDATED}>
      <p>Puedes borrar en cualquier momento los datos que Pelotaz tiene de tus cuentas de Facebook e Instagram.</p>

      <h2>Desde Pelotaz</h2>
      <ul>
        <li>Entra a tu cuenta en pelotaz.com y abre el plan de la semana de tu marca.</li>
        <li>
          En &laquo;Publicación automática&raquo;, elige <strong>Desconectar</strong>. Borramos en ese momento los
          tokens de acceso de Meta y cancelamos las publicaciones programadas.
        </li>
      </ul>

      <h2>Desde Facebook</h2>
      <ul>
        <li>
          En Facebook, ve a Configuración y privacidad → Configuración → Integraciones comerciales, elige Pelotaz y
          quítala. Esto revoca nuestro acceso de inmediato.
        </li>
      </ul>

      <h2>Borrar todo</h2>
      <p>
        Para borrar tu cuenta y todos sus datos (perfil de marca, publicaciones, conexiones y el registro de lo que
        publicamos por ti), escribe a <a href={`mailto:${CONTACT}`}>{CONTACT}</a> desde el correo de tu cuenta con el
        asunto &laquo;Eliminar mis datos&raquo;. Lo hacemos en un máximo de 30 días y te confirmamos por correo.
      </p>

      <h2>In English</h2>
      <p>
        To delete your Facebook and Instagram data from Pelotaz: choose <strong>Desconectar</strong> (Disconnect) under
        &laquo;Publicación automática&raquo; in your brand&apos;s weekly plan, which deletes the access tokens at once,
        or remove Pelotaz under Facebook Settings → Business Integrations. To delete your whole account, email{" "}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>; we do it within 30 days. See also our{" "}
        <Link href="/privacidad">privacy notice</Link>.
      </p>
    </LegalPage>
  );
}
