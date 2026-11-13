import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT, LegalPage, UPDATED } from "@/components/legal-page";

export const metadata: Metadata = { title: "Términos de uso" };

export default function TermsPage() {
  return (
    <LegalPage title="Términos de uso" updated={UPDATED}>
      <p>
        Al usar Pelotaz (pelotaz.com) aceptas estos términos. Si no estás de acuerdo, no uses el servicio. Dudas:{" "}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>

      <h2>El servicio</h2>
      <p>
        Pelotaz lee el sitio web público de tu negocio, arma un perfil de marca y propone publicaciones para redes
        sociales escritas con ayuda de modelos de lenguaje. Si conectas tus cuentas, publica en ellas las
        publicaciones que apruebes. Durante el piloto el acceso es por invitación y el servicio puede cambiar.
      </p>

      <h2>Tu responsabilidad</h2>
      <ul>
        <li>Solo conecta sitios, páginas y cuentas de negocios que administras o que tienes permiso de usar.</li>
        <li>
          Revisa cada publicación antes de aprobarla. Las propuestas pueden contener errores aunque Pelotaz marque los
          datos que no pudo confirmar. Lo que apruebas y publicas es tu responsabilidad.
        </li>
        <li>Cumple las reglas de Facebook e Instagram y la ley aplicable, incluida la publicidad de tus productos.</li>
        <li>Cuida el acceso a tu cuenta.</li>
      </ul>

      <h2>Tu contenido</h2>
      <p>
        Tu contenido y el de tu sitio siguen siendo tuyos. Nos das permiso de usarlo solo para prestarte el servicio.
        El tratamiento de datos se rige por nuestro <Link href="/privacidad">aviso de privacidad</Link>.
      </p>

      <h2>Límites</h2>
      <p>
        El servicio se ofrece tal cual. No garantizamos resultados de ventas o seguidores, ni que Facebook, Instagram u
        otros terceros estén disponibles en todo momento. En la medida que la ley lo permita, no respondemos por daños
        indirectos derivados del uso del servicio.
      </p>

      <h2>Terminación</h2>
      <p>
        Puedes dejar de usar Pelotaz cuando quieras y pedir que borremos tus datos. Podemos suspender cuentas que usen
        el servicio en contra de estos términos o de la ley.
      </p>

      <h2>Cambios y ley aplicable</h2>
      <p>
        Publicaremos cualquier cambio en esta página. Estos términos se rigen por las leyes de México, con
        jurisdicción en la Ciudad de México.
      </p>
    </LegalPage>
  );
}
