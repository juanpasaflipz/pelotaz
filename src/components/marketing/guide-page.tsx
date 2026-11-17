import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { BallMark } from "@/components/logo";
import { statusOf, type ModuleId } from "@/components/marketing/modules";
import { StatusChip } from "@/components/marketing/status-chip";
import { TrackedLink } from "@/components/marketing/track";
import { es } from "@/i18n/es";
import { guias, GUIDE_SLUGS, type GuideSlug } from "@/i18n/guias";

const SITE = "https://www.pelotaz.com";

/** Title, description, canonical and share preview for one guide. Each guide is its own indexable page. */
export function guideMetadata(slug: GuideSlug): Metadata {
  const guide = guias[slug];
  return {
    title: { absolute: guide.metaTitle },
    description: guide.metaDescription,
    alternates: { canonical: `/${slug}` },
    openGraph: {
      type: "article",
      locale: "es_MX",
      siteName: es.app.name,
      url: `/${slug}`,
      title: guide.metaTitle,
      description: guide.metaDescription,
      images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: es.marketing.hero.artLabel }],
    },
  };
}

/**
 * One public guide: a hero, its sections, whatever the guide adds (replies,
 * a plan), a FAQ and the call to the beta. The call carries utm parameters, which the
 * access request form already records, so a request says which guide it came from.
 */
export function GuidePage({ slug, children, modules }: { slug: GuideSlug; children?: ReactNode; modules?: ModuleId[] }) {
  const guide = guias[slug];
  const t = es.marketing.guides;
  const href = `/beta?utm_source=guia&utm_campaign=${slug}`;
  const others = GUIDE_SLUGS.filter((other) => other !== slug);
  return (
    <main>
      <JsonLd slug={slug} />
      <section className="bg-raya">
        <div className="mx-auto max-w-3xl px-5 pb-10 pt-10">
          <p className="text-sm font-semibold text-tinta-suave">{t.eyebrow}</p>
          <h1 className="display mt-2 text-4xl sm:text-6xl">
            {guide.title} <span className="text-marca">{guide.titleHighlight}</span>
          </h1>
          <p className="mt-4 max-w-prose text-lg">{guide.lead}</p>
        </div>
      </section>

      <article className="mx-auto max-w-3xl px-5 py-10">
        {guide.sections.map((section) => (
          <section key={section.heading} className="mb-10">
            <h2 className="display text-3xl">{section.heading}</h2>
            {section.body.map((paragraph) => (
              <p key={paragraph} className="mt-3 max-w-prose text-lg">
                {paragraph}
              </p>
            ))}
            {section.list && (
              <ul className="mt-3 max-w-prose list-disc space-y-2 pl-6 text-lg">
                {section.list.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </section>
        ))}

        {modules && (
          <ul className="mb-10 grid gap-3">
            {modules.map((id) => (
              <li key={id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-borde bg-raya px-4 py-3">
                <span className="font-semibold">{es.marketing.modules.items[id].title}</span>
                <StatusChip status={statusOf(id)} />
              </li>
            ))}
          </ul>
        )}

        {children}

        <section className="mb-10">
          <h2 className="display text-3xl">{es.marketing.faq.title}</h2>
          <ul className="mt-4 border-t-2 border-tinta">
            {guide.faq.map((item) => (
              <li key={item.q} className="border-b border-borde">
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-semibold">
                    {item.q}
                    <span aria-hidden className="text-xl leading-none group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="pb-4 text-tinta-suave">{item.a}</p>
                </details>
              </li>
            ))}
          </ul>
        </section>
      </article>

      <section className="wall">
        <div className="mx-auto max-w-3xl px-5 py-12">
          <BallMark className="size-12 [&_circle:first-child]:fill-raya [&_circle:last-child]:fill-marca" />
          <h2 className="display mt-4 text-4xl sm:text-5xl">{t.ctaTitle}</h2>
          <p className="mt-3 max-w-prose text-lg">{t.ctaLead}</p>
          <TrackedLink href={href} event="guide_cta" className="button button-on-wall mt-6">
            {t.cta}
          </TrackedLink>
        </div>
      </section>

      <nav aria-label={t.moreLabel} className="mx-auto max-w-3xl px-5 py-10">
        <h2 className="display text-2xl">{t.moreLabel}</h2>
        <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
          {others.map((other) => (
            <li key={other}>
              <Link href={`/${other}`} className="font-semibold underline underline-offset-4">
                {guias[other].linkLabel}
              </Link>
            </li>
          ))}
          <li>
            <Link href="/" className="font-semibold underline underline-offset-4">
              pelotaz.com
            </Link>
          </li>
        </ul>
      </nav>
    </main>
  );
}

/** Only what the page really has: the questions and answers it shows. */
function JsonLd({ slug }: { slug: GuideSlug }) {
  const guide = guias[slug];
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    url: `${SITE}/${slug}`,
    inLanguage: "es-MX",
    mainEntity: guide.faq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
