import type { Metadata } from "next";
import Link from "next/link";
import { JonasOnCouch } from "@/components/marketing/jonas";
import { ShareButtons } from "@/components/marketing/share-buttons";
import { TrackedLink } from "@/components/marketing/track";
import { es } from "@/i18n/es";

const t = es.marketing.jonas;
const URL = "https://www.pelotaz.com/jonas";

// Jonás and the reel on a page made to be passed around. He wears the reel's
// pyjamas here: this is the page most likely to end up on Facebook.
export const metadata: Metadata = {
  title: { absolute: t.metaTitle },
  description: t.metaDescription,
  alternates: { canonical: "/jonas" },
  openGraph: {
    type: "website",
    locale: "es_MX",
    siteName: es.app.name,
    url: "/jonas",
    title: t.metaTitle,
    description: t.metaDescription,
    images: [{ url: "/jonas/opengraph-image", width: 1200, height: 630, alt: t.art }],
  },
};

export default function JonasPage() {
  return (
    <main>
      <section className="bg-raya">
        <div className="mx-auto grid max-w-5xl items-center gap-10 px-5 pb-12 pt-8 md:grid-cols-[1fr_18rem] md:pt-14">
          <div>
            <h1 className="display text-5xl sm:text-7xl">
              {t.title} <span className="text-marca">{t.titleHighlight}</span>
            </h1>
            <p className="mt-5 max-w-md text-lg">{t.lead}</p>
            <JonasOnCouch label={t.art} outfit="pyjamas" className="mt-6 hidden h-auto w-full max-w-md md:block" />
          </div>
          <video
            className="mx-auto aspect-[9/16] w-full max-w-[18rem] rounded-2xl bg-tinta shadow-xl"
            src="/video/trabaja-en-pelotaz.mp4"
            poster="/video/trabaja-en-pelotaz.jpg"
            aria-label={t.reelLabel}
            controls
            playsInline
            preload="none"
          />
        </div>
      </section>

      <section className="bg-cal">
        <div className="mx-auto grid max-w-5xl gap-10 px-5 py-14 md:grid-cols-2">
          <div>
            <h2 className="display text-4xl">{t.dayTitle}</h2>
            <ol className="mt-6 grid gap-4">
              {t.day.map((beat) => (
                <li key={beat.time} className="flex gap-4">
                  <span className="display w-20 flex-none text-2xl text-marca">{beat.time}</span>
                  <span className="pt-1">{beat.text}</span>
                </li>
              ))}
            </ol>
          </div>
          <dl className="grid content-start gap-4 rounded-xl bg-raya p-6">
            {t.facts.map((fact) => (
              <div key={fact.label}>
                <dt className="text-sm text-tinta-suave">{fact.label}</dt>
                <dd className="display text-xl">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="bg-raya">
        <div className="mx-auto max-w-5xl px-5 py-14">
          <h2 className="display text-3xl sm:text-4xl">{t.shareTitle}</h2>
          <div className="mt-6">
            <ShareButtons url={URL} />
          </div>
        </div>
      </section>

      <section className="wall">
        <div className="mx-auto max-w-5xl px-5 py-14">
          <h2 className="display text-4xl sm:text-5xl">{t.ctaTitle}</h2>
          <TrackedLink href="/beta" event="jonas_cta" className="button button-on-wall mt-6">
            {t.cta}
          </TrackedLink>
          <p className="mt-6">
            <Link href="/" className="font-semibold underline underline-offset-4">
              pelotaz.com
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
