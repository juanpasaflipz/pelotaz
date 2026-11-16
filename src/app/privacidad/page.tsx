import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT, LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Aviso de privacidad" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Aviso de privacidad" updated="15 de noviembre de 2026">
      <p>
        Pelotaz (pelotaz.com) es un servicio que ayuda a negocios a planear, escribir y publicar contenido para sus
        redes sociales. Este aviso explica qué datos tratamos, para qué y cómo puedes ejercer tus derechos. Para
        cualquier asunto de privacidad escríbenos a <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>

      <h2>Qué datos tratamos</h2>
      <ul>
        <li>
          <strong>Si pides acceso a la beta:</strong> tu correo electrónico, el nombre de tu negocio y la dirección de
          su sitio web.
        </li>
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
          se guardan cifrados. Guardamos también el identificador y el enlace de cada publicación que hacemos por ti, y
          sus resultados (alcance, vistas e interacciones).
        </li>
        <li>
          <strong>Si conectas tu Perfil de Negocio de Google:</strong> el identificador de tu cuenta y de tus
          ubicaciones, la información de tu perfil (nombre, dirección, teléfono, horarios, categorías, descripción y
          fotos), las reseñas de tus clientes y tus respuestas, tus publicaciones en el perfil y sus métricas de
          rendimiento (búsquedas, vistas, llamadas, solicitudes de cómo llegar y clics al sitio web), y los tokens de
          acceso que Google nos entrega con tu autorización. Los tokens se guardan cifrados.
        </li>
        <li>
          <strong>Datos técnicos:</strong> registros del servidor (fecha, ruta solicitada, errores) para operar y
          proteger el servicio.
        </li>
      </ul>
      <p>
        No pedimos ni guardamos datos de tus seguidores ni tus mensajes privados, y no tratamos datos personales
        sensibles. De las reseñas de Google solo usamos el nombre público y el texto que el cliente publicó, para
        proponerte una respuesta.
      </p>

      <h2>Para qué los usamos</h2>
      <ul>
        <li>Responder tu solicitud de acceso a la beta y avisarte cuando esté lista.</li>
        <li>Crear y mantener tu cuenta y tu espacio de trabajo.</li>
        <li>Armar el perfil de tu marca y escribir propuestas de publicaciones con ayuda de modelos de lenguaje.</li>
        <li>
          Publicar en tu página de Facebook y tu cuenta de Instagram únicamente las publicaciones que tú apruebas, en la
          fecha y hora que eliges.
        </li>
        <li>
          Medir cómo les fue a tus publicaciones para que el plan de la siguiente semana aprenda de los resultados.
        </li>
        <li>
          En tu Perfil de Negocio de Google: revisar que tu información esté completa y correcta, proponerte cambios,
          publicar los posts y respuestas a reseñas que tú apruebas, y mostrarte tus métricas. No cambiamos nada de tu
          perfil sin tu aprobación.
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
        <li>Google, cuando actualizamos o publicamos por ti en tu Perfil de Negocio.</li>
      </ul>
      <p>
        Algunos de estos proveedores procesan datos fuera de México, principalmente en Estados Unidos. También podemos
        revelar datos cuando una autoridad competente lo requiera conforme a la ley.
      </p>

      <h2>Cuánto tiempo los guardamos</h2>
      <p>
        Mientras tu cuenta esté activa. Las solicitudes de acceso se guardan mientras dure la beta; puedes pedirnos
        borrar la tuya en cualquier momento. Si desconectas Facebook e Instagram o tu Perfil de Negocio de Google,
        borramos los tokens de acceso de ese servicio en ese momento. Si nos pides cerrar tu cuenta, borramos tus datos en un máximo de 30 días, salvo lo que la ley nos
        obligue a conservar.
      </p>

      <h2>Datos de Google</h2>
      <p>
        El uso que Pelotaz hace de la información recibida de las APIs de Google, y su transferencia a cualquier otra
        aplicación, se apega a la{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy">
          Política de datos de usuario de los servicios de API de Google
        </a>
        , incluidos los requisitos de Uso Limitado. No usamos los datos de Google para publicidad, no los vendemos y no
        los usamos para entrenar modelos de inteligencia artificial generales. Puedes retirar el acceso en cualquier
        momento desde Pelotaz o desde{" "}
        <a href="https://myaccount.google.com/permissions">la configuración de tu cuenta de Google</a>.
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
        Los datos viajan cifrados (HTTPS), los tokens de Meta y Google se guardan cifrados y cada negocio solo puede ver sus
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
        Meta issues, stored encrypted, plus the results (reach, views, interactions) of posts Pelotaz publishes. When
        the user connects a Google Business Profile, we process its account and location IDs, profile information,
        reviews and replies, profile posts, performance metrics and the access tokens Google issues, stored encrypted.
        We use them only to provide the service, to publish posts and review replies the user has approved, and to
        show the user their metrics; we never change a profile without the user&apos;s approval. Pelotaz&apos;s use and
        transfer to any other app of information received from Google APIs will adhere to the{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy">
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements. We do not sell data or use it for advertising. Service providers:
        Neon, Vercel, Anthropic/OpenAI, Meta, Google. Users can disconnect at any time, which deletes the tokens, and
        can request deletion of all their data
        at <a href={`mailto:${CONTACT}`}>{CONTACT}</a> (see <Link href="/eliminar-datos">data deletion</Link>).
      </p>
    </LegalPage>
  );
}
