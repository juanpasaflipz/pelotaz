import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Analytics } from "@vercel/analytics/next";
// Self-hosted variable fonts: no request to a font CDN at build or run time.
import "@fontsource-variable/nunito";
import "@fontsource-variable/instrument-sans";
import "./globals.css";
import { HeaderNav } from "@/components/header-nav";
import { Logo } from "@/components/logo";
import { es } from "@/i18n/es";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.pelotaz.com"),
  title: { default: es.app.name, template: `%s | ${es.app.name}` },
  description: es.app.tagline,
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-MX">
      <body className="antialiased">
        <header className="border-b border-borde bg-raya text-tinta">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-3">
            <Link href="/">
              <Logo name={es.app.name} />
            </Link>
            <Suspense fallback={null}>
              <HeaderNav />
            </Suspense>
          </div>
        </header>
        {children}
        <footer className="mx-auto flex max-w-4xl flex-wrap gap-x-5 gap-y-2 px-5 pb-10 pt-6 text-sm text-tinta-suave">
          <Link href="/privacidad" className="underline-offset-4 hover:underline">
            Aviso de privacidad
          </Link>
          <Link href="/terminos" className="underline-offset-4 hover:underline">
            Términos
          </Link>
          <a href={`mailto:${es.marketing.footer.contact}`} className="underline-offset-4 hover:underline">
            {es.marketing.footer.contact}
          </a>
          {es.marketing.footer.social.map((link) => (
            <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">
              {link.label}
            </a>
          ))}
        </footer>
        <Analytics />
      </body>
    </html>
  );
}
