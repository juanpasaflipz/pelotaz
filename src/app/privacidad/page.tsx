import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT, LegalPage, UPDATED } from "@/components/legal-page";

export const metadata: Metadata = { title: "Aviso de privacidad" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Aviso de privacidad" updated={UPDATED}>
      <p>
        Pelotaz (pelotaz.com) es un servicio que ayuda a negocios a planear, escribir y publicar contenido para sus
        redes sociales. Este aviso explica qué datos tratamos, para qué y cómo puedes ejercer tus derechos. Para
        cualquier asunto de privacidad escríbenos a <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>

      <h2>Qué datos tratamos</h2>
      <ul>
        <li>
          <strong>Tu cuenta:</strong> nombre, correo electrónico y contraseña (guardada cifrada por nuestro proveedor de
          inicio de sesión).
        </li>
        <li>
          <strong>Tu negocio:</strong> la dirección de tu sitio web y el contenido público que leemos de él (textos,
          precios, fotos, colores), el perfil de marca que armamos a partir de eso y los cambios que le hagas.
        </li>
        <li>
          <strong>Tu contenido:</strong> los planes semanales, los textos de las publicaciones, tus ediciones y
          aprobaciones.
        </li>
        <li>
          <strong>Si conectas Facebook e Instagram:</strong> el identificador y nombre de tu página de Facebook y de tu
          cuenta profesional de Instagram, y los tokens de acceso que Meta nos entrega con tu autorización. Los tokens
          se guardan cifrados. Guardamos también el identificador y el enlace de cada publicación que hacemos por ti.
        </li>
        <li>
          <strong>Datos técnicos:</strong> registros del servidor (fecha, ruta solicitada, errores) para operar y
          proteger el servicio.
        </li>
      </ul>
      <p>
        No pedimos ni guardamos datos de tus seguidores, mensajes privados ni estadísticas de tus cuentas, y no
        tratamos datos personales sensibles.
      </p>

      <h2>Para qué los usamos</h2>
      <ul>
        <li>Crear y mantener tu cuenta y tu espacio de trabajo.</li>
        <li>Armar el perfil de tu marca y escribir propuestas de publicaciones con ayuda de modelos de lenguaje.</li>
        <li>
          Publicar en tu página de Facebook y tu cuenta de Instagram únicamente las publicaciones que tú apruebas, en la
          fecha y hora que eliges.
        </li>
        <li>Mantener el servicio seguro y resolver fallas.</li>
      </ul>
      <p>
        No vendemos tus datos, no los usamos para publicidad y no publicamos nada que no hayas aprobado.
      </p>

      <h2>Con quién los compartimos</h2>
      <p>Solo con los proveedores que necesitamos para prestar el servicio, que los tratan por cuenta nuestra:</p>
      <ul>
        <li>Neon (base de datos e inicio de sesión) y Vercel (alojamiento del sitio).</li>
        <li>
          Anthropic y, en su caso, OpenAI (modelos de lenguaje), que reciben el contenido de tu sitio y de tu perfil de
          marca para escribir las propuestas. Estos proveedores no usan los datos enviados por su API para entrenar
          sus modelos según sus términos comerciales.
        </li>
        <li>Meta Platforms, cuando publicamos por ti en Facebook o Instagram.</li>
      </ul>
      <p>
        Algunos de estos proveedores procesan datos fuera de México, principalmente en Estados Unidos. También podemos
        revelar datos cuando una autoridad competente lo requiera conforme a la ley.
      </p>

      <h2>Cuánto tiempo los guardamos</h2>
      <p>
        Mientras tu cuenta esté activa. Si desconectas Facebook e Instagram, borramos los tokens de acceso en ese
        momento. Si nos pides cerrar tu cuenta, borramos tus datos en un máximo de 30 días, salvo lo que la ley nos
        obligue a conservar.
      </p>

      <h2>Tus derechos</h2>
      <p>
        Puedes pedir acceso a tus datos, corregirlos, cancelarlos u oponerte a su uso (derechos ARCO), y revocar tu
        consentimiento, escribiendo a <a href={`mailto:${CONTACT}`}>{CONTACT}</a> desde el correo de tu cuenta.
        Respondemos en un máximo de 20 días hábiles. Para borrar los datos relacionados con Facebook e Instagram, sigue
        las <Link href="/eliminar-datos">instrucciones de eliminación de datos</Link>.
      </p>

      <h2>Seguridad</h2>
      <p>
        Los datos viajan cifrados (HTTPS), los tokens de Meta se guardan cifrados y cada negocio solo puede ver sus
        propios datos, con aislamiento aplicado por la propia base de datos.
      </p>

      <h2>Cambios</h2>
      <p>
        Si cambiamos este aviso, publicaremos la nueva versión en esta página con su fecha y, si el cambio es
        importante, te avisaremos por correo.
      </p>

      <h2>Summary in English</h2>
      <p>
        Pelotaz helps businesses plan, write and publish social media posts. We process account data (name, email),
        the public content of the business&apos;s website, the brand profile and posts created in Pelotaz, and, when
        the user connects Facebook and Instagram, their Page and Instagram account IDs and names and the access tokens
        Meta issues, stored encrypted. We use them only to provide the service and to publish posts the user has
        approved. We do not sell data or use it for advertising. Service providers: Neon, Vercel, Anthropic/OpenAI,
        Meta. Users can disconnect at any time, which deletes the tokens, and can request deletion of all their data
        at <a href={`mailto:${CONTACT}`}>{CONTACT}</a> (see <Link href="/eliminar-datos">data deletion</Link>).
      </p>
    </LegalPage>
  );
}
