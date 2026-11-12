import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Suspense } from "react";
// Self-hosted variable fonts: no request to a font CDN at build or run time.
import "@fontsource-variable/big-shoulders";
import "@fontsource-variable/instrument-sans";
import "./globals.css";
import { AccountMenu } from "@/components/account-menu";
import { es } from "@/i18n/es";

export const metadata: Metadata = {
  title: { default: es.app.name, template: `%s | ${es.app.name}` },
  description: es.app.tagline,
};

export const viewport: Viewport = {
  themeColor: "#0e5a43",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-MX">
      <body className="antialiased">
        <header className="bg-cancha-profunda text-raya">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-3">
            <Link href="/" className="display text-2xl">
              {es.app.name}
            </Link>
            <nav className="flex items-center gap-5">
              <Link href="/" className="text-sm font-medium underline-offset-4 hover:underline">
                {es.app.brands}
              </Link>
              <Suspense fallback={null}>
                <AccountMenu />
              </Suspense>
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
