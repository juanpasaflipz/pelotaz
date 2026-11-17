import Link from "next/link";
import { Suspense } from "react";
import { AccessRequestForm } from "@/components/access-request-form";
import { BallMark } from "@/components/logo";
import { CaseStudy } from "@/components/marketing/case-study";
import { JonasOnCouch } from "@/components/marketing/jonas";
import { MODULES, statusOf, type ModuleId } from "@/components/marketing/modules";
import { Pricing } from "@/components/marketing/pricing";
import { StatusChip } from "@/components/marketing/status-chip";
import { TrackedLink } from "@/components/marketing/track";
import { es } from "@/i18n/es";

const t = es.marketing;

/**
 * What a signed-out visitor sees at pelotaz.com. One joke told well, then
 * proven: Jonás does nothing, the red ball does the work. Every module wears
 * its real status (src/components/marketing/modules.ts) and every number has
 * a source. Plan: claude/landing-page-plan.md in the Pelotaz project.
 */
export function Landing() {
  return (
    <main>
      <JsonLd />
      <SectionNav />
      <Hero />
      <Day />
      <Modules />
      <Sample />
      <Suspense fallback={null}>
        <CaseStudy />
      </Suspense>
      <Compare />
      <Audience />
      <section id="precios" className="scroll-mt-16 bg-cal">
        <div className="mx-auto max-w-5xl px-5 py-14">
          <h2 className="display text-4xl sm:text-5xl">{t.pricing.title}</h2>
          <p className="mt-3 max-w-prose text-lg">{t.pricing.lead}</p>
          <Pricing />
          <p className="mt-5 font-medium">{t.pricing.payment}</p>
          <div className="mt-8">
            <h3 className="display text-2xl">{t.pricing.addonsTitle}</h3>
            <ul className="mt-3 flex flex-wrap gap-2">
              {t.pricing.addons.map((addon) => (
                <li key={addon} className="rounded-full border border-borde bg-raya px-3 py-1 text-sm">
                  {addon}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-tinta-suave">{t.pricing.addonsNote}</p>
          </div>
          <p className="mt-8 font-semibold">{t.pricing.greenMonkey}</p>
          <p className="mt-2 text-sm text-tinta-suave">{t.pricing.smallPrint}</p>
        </div>
      </section>
      <Faq />
      <Closing />
    </main>
  );
}

function Heading({ before, highlight }: { before: string; highlight: string }) {
  return (
    <h2 className="display text-4xl sm:text-5xl">
      {before} <span className="text-marca">{highlight}</span>
    </h2>
  );
}

function SectionNav() {
  const links = [
    ["#modulos", t.nav.modules],
    ["#como-funciona", t.nav.how],
    ["#precios", t.nav.pricing],
    ["#preguntas", t.nav.faq],
  ] as const;
  return (
    <nav aria-label={t.nav.label} className="sticky top-0 z-20 border-b border-borde bg-raya/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-5 py-2">
        <a href="#inicio" aria-label={es.app.name} className="hidden flex-none sm:block">
          <BallMark className="size-6" />
        </a>
        <ul className="flex min-w-0 flex-1 gap-4 overflow-x-auto whitespace-nowrap text-sm font-medium">
          {links.map(([href, label]) => (
            <li key={href}>
              <a href={href} className="underline-offset-4 hover:underline">
                {label}
              </a>
            </li>
          ))}
        </ul>
        <TrackedLink href="#acceso" event="nav_button" className="button button-primary flex-none !min-h-9 !px-3 !py-1 text-sm">
          {t.nav.cta}
        </TrackedLink>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section id="inicio" className="bg-raya">
      <div className="mx-auto grid max-w-5xl items-center gap-8 px-5 pb-12 pt-8 md:grid-cols-2 md:pt-14">
        <div>
          <h1 className="display text-5xl sm:text-7xl">
            {t.hero.titleBefore} <span className="text-marca">{t.hero.titleHighlight}</span>
          </h1>
          <p className="mt-5 max-w-md text-lg">{t.hero.lead}</p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <TrackedLink href="#acceso" event="hero_button" className="button button-primary">
              {t.hero.cta}
            </TrackedLink>
            <a href="#como-funciona" className="button button-quiet">
              {t.hero.secondary}
            </a>
          </div>
          <p className="mt-4 text-sm text-tinta-suave">{t.hero.note}</p>
          <p className="mt-2 text-sm">
            {es.landing.haveAccess}{" "}
            <Link href="/auth/sign-in" className="font-semibold underline underline-offset-4">
              {es.auth.signIn}
            </Link>
          </p>
        </div>
        <div className="relative">
          <JonasOnCouch label={t.hero.artLabel} className="h-auto w-full" />
          <ul aria-hidden className="mt-3 grid justify-items-start gap-2 sm:absolute sm:left-0 sm:top-0 sm:mt-0">
            {t.hero.notifications.map((note) => (
              <li
                key={note}
                className="flex items-center gap-2 rounded-lg bg-raya px-3 py-1.5 text-xs font-semibold shadow-md sm:text-sm"
              >
                <BallMark className="size-4" />
                {note}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Day() {
  return (
    <section id="como-funciona" className="scroll-mt-16 bg-cal">
      <div className="mx-auto max-w-5xl px-5 py-14">
        <h2 className="display text-4xl sm:text-5xl">{t.day.title}</h2>
        <p className="mt-3 max-w-prose text-lg">{t.day.lead}</p>
        <ol className="-mx-5 mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0">
          {t.day.beats.map((beat) => {
            const moduleId = beat.module as ModuleId;
            const status = statusOf(moduleId);
            return (
              <li key={beat.time} className="flex w-[78%] flex-none snap-start flex-col rounded-xl bg-raya p-5 md:w-auto">
                <p className="display text-3xl text-marca">{beat.time}</p>
                <h3 className="display mt-2 text-xl">{beat.title}</h3>
                <p className="mt-2 flex-1 text-tinta-suave">{beat.body}</p>
                <p className="mt-4 flex flex-wrap items-center gap-2">
                  <StatusChip status={status} />
                  <a href={`#modulo-${moduleId}`} className="text-sm font-semibold underline underline-offset-4">
                    {t.day.seeModule}
                  </a>
                </p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function Modules() {
  return (
    <section id="modulos" className="scroll-mt-16 bg-raya">
      <div className="mx-auto max-w-5xl px-5 py-14">
        <Heading before={t.modules.title} highlight={t.modules.titleHighlight} />
        <p className="mt-3 max-w-prose text-lg">{t.modules.lead}</p>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map(({ id, status }) => {
            const item: { title: string; body: string; note?: string } = t.modules.items[id];
            return (
              <li id={`modulo-${id}`} key={id} className="scroll-mt-16 rounded-xl border-2 border-borde p-5">
                <StatusChip status={status} note={item.note} />
                <h3 className="display mt-3 text-xl">{item.title}</h3>
                <p className="mt-2 text-tinta-suave">{item.body}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function Sample() {
  return (
    <section className="bg-cal">
      <div className="mx-auto max-w-5xl px-5 py-14">
        <Heading before={t.sample.title} highlight={t.sample.titleHighlight} />
        <p className="mt-3 max-w-prose text-lg">{t.sample.lead}</p>
        <div className="mt-8 rounded-xl bg-raya p-5">
          <p className="flex flex-wrap items-center gap-3">
            <span className="display text-2xl">{t.sample.business}</span>
            <span className="rounded-full bg-tinta px-2.5 py-0.5 text-xs font-semibold text-raya">{t.sample.label}</span>
          </p>
          <ul className="mt-4 grid gap-3">
            {t.sample.posts.map((post) => (
              <li key={post.day}>
                <details className="group rounded-lg border-2 border-borde open:border-tinta">
                  <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-3 gap-y-1 p-4">
                    <span className="font-semibold text-marca-profunda">{post.day}</span>
                    <span className="display text-lg">{post.title}</span>
                    <span className="text-sm text-tinta-suave">{post.channel}</span>
                    <span aria-hidden className="ml-auto text-xl leading-none group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <div className="grid gap-3 border-t border-borde p-4">
                    <p>
                      <span className="font-semibold">{t.sample.reasonLabel}: </span>
                      {post.reason}
                    </p>
                    <div>
                      <p className="font-semibold">{t.sample.draftLabel}</p>
                      <p className="mt-1 rounded bg-cal p-3">{post.draft}</p>
                    </div>
                    <div>
                      <p className="font-semibold">{t.sample.checksLabel}</p>
                      <ul className="mt-1 grid gap-1">
                        {post.checks.map((check) => (
                          <li key={check} className="flex gap-2">
                            <span aria-hidden className="font-bold text-ok">
                              ✓
                            </span>
                            {check}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-4 text-tinta-suave">{t.sample.soon}</p>
      </div>
    </section>
  );
}

function Compare() {
  const c = t.compare;
  return (
    <section className="bg-cal">
      <div className="mx-auto max-w-5xl px-5 py-14">
        <Heading before={c.title} highlight={c.titleHighlight} />
        <div className="mt-8 overflow-hidden rounded-xl border-2 border-tinta bg-raya">
          <div aria-hidden className="grid grid-cols-3 gap-2 border-b-2 border-tinta px-4 py-3 text-sm font-bold">
            {c.columns.map((column, index) => (
              <span key={column} className={index === 2 ? "text-marca" : undefined}>
                {column}
              </span>
            ))}
          </div>
          <dl>
            {c.rows.map((row) => (
              <div key={row.label} className="border-b border-borde px-4 py-3 last:border-b-0">
                <dt className="font-semibold">{row.label}</dt>
                <dd className="mt-1 grid grid-cols-3 gap-2 text-sm">
                  {row.values.map((value, index) => (
                    <span key={c.columns[index]} className={index === 2 ? "font-semibold text-marca-profunda" : "text-tinta-suave"}>
                      <span className="sr-only">{c.columns[index]}: </span>
                      {value}
                    </span>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="mt-3 text-sm text-tinta-suave">{c.note}</p>
      </div>
    </section>
  );
}

function Audience() {
  const a = t.audience;
  return (
    <section className="bg-raya">
      <div className="mx-auto max-w-5xl px-5 py-14">
        <Heading before={a.title} highlight={a.titleHighlight} />
        <p className="mt-3 max-w-prose text-lg">{a.lead}</p>
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {a.trades.map((trade) => (
            <li key={trade.name} className="flex items-center justify-between gap-3 rounded-xl border-2 border-borde p-4">
              <span>
                <span className="display block text-lg">{trade.name}</span>
                <span className={`text-sm font-semibold ${trade.ready ? "text-ok" : "text-tinta-suave"}`}>
                  {trade.ready ? a.now : a.soon}
                </span>
              </span>
              {!trade.ready && (
                <a href="#acceso" className="text-sm font-semibold underline underline-offset-4">
                  {a.join}
                </a>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section id="preguntas" className="scroll-mt-16 bg-raya">
      <div className="mx-auto max-w-3xl px-5 py-14">
        <h2 className="display text-4xl sm:text-5xl">{t.faq.title}</h2>
        <ul className="mt-6 border-t-2 border-tinta">
          {t.faq.items.map((item) => (
            <li key={item.q} className="border-b border-borde">
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-semibold">
                  {item.q}
                  <span aria-hidden className="text-xl leading-none group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="pb-4 text-tinta-suave">
                  {item.a}
                  {item.privacyLink && (
                    <>
                      {" "}
                      <Link href="/privacidad" className="font-semibold text-tinta underline underline-offset-4">
                        {es.landing.privacy}
                      </Link>
                    </>
                  )}
                </p>
              </details>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Closing() {
  return (
    <section id="acceso" className="wall scroll-mt-12">
      <div className="mx-auto grid max-w-5xl gap-8 px-5 pb-16 pt-12 md:grid-cols-2">
        <div>
          <BallMark className="size-14 [&_circle:first-child]:fill-raya [&_circle:last-child]:fill-marca" />
          <h2 className="display mt-4 text-5xl sm:text-6xl">
            {t.closing.title} {t.closing.titleHighlight}
          </h2>
          <p className="mt-4 max-w-md text-lg">{t.closing.lead}</p>
        </div>
        <div>
          <h3 className="display text-3xl">{es.landing.formTitle}</h3>
          <AccessRequestForm />
        </div>
      </div>
    </section>
  );
}

function JsonLd() {
  const data = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: es.app.name,
      url: "https://www.pelotaz.com/",
      sameAs: t.footer.social.map((link) => link.href),
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      inLanguage: "es-MX",
      description: t.jsonLd.description,
      offers: { "@type": "Offer", name: t.pricing.plans.beta.name, price: "0", priceCurrency: "MXN" },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: t.faq.items.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    },
  ];
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
