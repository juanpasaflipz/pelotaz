import type { ReactNode } from "react";

/** Plain reading layout for the legal pages. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-5 pb-24 pt-10">
      <h1 className="display text-5xl">{title}</h1>
      <p className="mt-2 text-sm text-tinta-suave">Última actualización: {updated}</p>
      <div className="legal mt-8 grid gap-4 leading-relaxed [&_h2]:display [&_h2]:mt-6 [&_h2]:text-3xl [&_li]:ml-5 [&_li]:list-disc [&_a]:underline [&_a]:underline-offset-4">
        {children}
      </div>
    </main>
  );
}

export const CONTACT = "hello@pelotaz.com";
export const UPDATED = "13 de noviembre de 2026";
