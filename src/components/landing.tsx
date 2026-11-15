import Link from "next/link";
import { AccessRequestForm } from "@/components/access-request-form";
import { BallMark } from "@/components/logo";
import { es } from "@/i18n/es";

/**
 * What a signed-out visitor sees at the site's address: what Pelotaz does,
 * what the private beta includes and does not, and the form to ask for a
 * place. Keep every claim here true of the product as it runs today.
 */
export function Landing() {
  const t = es.landing;
  return (
    <main>
      <section className="wall">
        <div className="mx-auto max-w-4xl px-5 pb-14 pt-10">
          <p className="inline-flex items-center gap-2 rounded-full bg-raya px-3 py-1 text-sm font-semibold text-marca-profunda">
            <BallMark className="size-4" />
            {t.badge}
          </p>
          <h1 className="display mt-5 max-w-3xl text-5xl sm:text-7xl">{t.title}</h1>
          <p className="mt-5 max-w-xl text-lg">{t.lead}</p>
          <p className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
            <a href="#acceso" className="button button-on-wall">
              {t.cta}
            </a>
            <span className="text-sm">
              {t.haveAccess}{" "}
              <Link href="/auth/sign-in" className="font-semibold underline underline-offset-4">
                {es.auth.signIn}
              </Link>
            </span>
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-5 py-12">
        <h2 className="display text-3xl">{t.includesTitle}</h2>
        <ul className="mt-6 grid gap-x-8 gap-y-6 border-t-2 border-tinta pt-6 sm:grid-cols-3">
          {t.includes.map((item) => (
            <li key={item.title}>
              <h3 className="display text-xl">{item.title}</h3>
              <p className="mt-2 text-tinta-suave">{item.body}</p>
            </li>
          ))}
        </ul>

        <div className="mt-10 max-w-prose border-l-4 border-bola bg-raya px-5 py-4">
          <h2 className="display text-2xl">{t.laterTitle}</h2>
          <p className="mt-1">{t.later}</p>
        </div>

        <h2 className="display mt-12 text-3xl">{t.stepsTitle}</h2>
        <ol className="mt-6 grid max-w-prose gap-3">
          {t.steps.map((step, index) => (
            <li key={step} className="flex gap-3">
              <span className="display flex size-7 flex-none items-center justify-center rounded-full bg-marca text-sm text-raya">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <p className="mt-5 max-w-prose text-tinta-suave">{t.terms}</p>
      </section>

      <section id="acceso" className="wall scroll-mt-4">
        <div className="mx-auto max-w-4xl px-5 pb-14 pt-10">
          <h2 className="display text-4xl sm:text-5xl">{t.formTitle}</h2>
          <AccessRequestForm />
        </div>
      </section>
    </main>
  );
}
