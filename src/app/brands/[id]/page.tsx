import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { AccessNotice } from "@/components/access-notice";
import { DnaEditor } from "@/components/dna-editor";
import { OnboardingProgress } from "@/components/onboarding-progress";
import { RestartButton } from "@/components/restart-button";
import { SetupNotice } from "@/components/setup-notice";
import { es } from "@/i18n/es";
import { getAccessOrSetup } from "@/lib/auth/session";
import type { ReviewFlag } from "@/lib/brand-dna/schema";
import { getBrandWithDna } from "@/lib/data";

// Restarting onboarding from this page can run the crawl in-process in local development.
export const maxDuration = 300;

export default function BrandPage({ params }: PageProps<"/brands/[id]">) {
  return (
    <main className="mx-auto max-w-4xl px-5 pb-24 pt-8">
      <Link href="/" className="text-sm font-medium text-tinta-suave underline underline-offset-4">
        {es.brand.back}
      </Link>
      <Suspense fallback={<div className="mt-6 h-40 rounded bg-borde/50" aria-hidden />}>
        <BrandView params={params} />
      </Suspense>
    </main>
  );
}

async function BrandView({ params }: Pick<PageProps<"/brands/[id]">, "params">) {
  const { id } = await params;
  const access = await getAccessOrSetup();
  if (access.kind === "setup") return <SetupNotice />;
  if (access.kind === "signed_out") redirect("/auth/sign-in");
  if (access.kind !== "ok") return <AccessNotice kind={access.kind} email={access.email} />;
  const data = await getBrandWithDna(access.tenantId, id);
  if (!data) notFound();
  const { brand, dna } = data;
  const working =
    brand.status === "pending" || brand.status === "crawling" || brand.status === "building";

  return (
    <>
      <h1 className="display mt-4 break-words text-5xl sm:text-6xl">{brand.name}</h1>
      <p className="mt-2 break-all text-tinta-suave">{brand.sourceUrl}</p>

      {brand.status === "ready" && dna && (
        <Link href={`/brands/${brand.id}/semana`} className="button button-primary mt-6">
          {es.week.link} →
        </Link>
      )}

      {working && <OnboardingProgress brandId={brand.id} initial={brand.status as "pending"} />}

      {brand.status === "failed" && (
        <div className="mt-8 border-l-4 border-chapa bg-chapa-fondo px-5 py-4" role="alert">
          <p className="display text-2xl text-chapa">{es.status.failed}</p>
          <p className="mt-1 max-w-prose">{failureCopy(brand.statusDetail)}</p>
          <div className="mt-4">
            <RestartButton brandId={brand.id} recrawl={false} label={es.brand.retry} primary />
          </div>
        </div>
      )}

      {dna && !working && (
        <>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-tinta-suave">
              {es.brand.version(dna.version)}, {es.brand.sources[dna.source]}
            </p>
            {brand.status === "ready" && (
              <div className="flex items-center gap-3">
                <p className="hidden max-w-xs text-right text-sm text-tinta-suave sm:block">
                  {es.brand.recrawlHint}
                </p>
                <RestartButton brandId={brand.id} recrawl label={es.brand.recrawl} />
              </div>
            )}
          </div>
          {dna.reviewFlags.length > 0 && <Flags flags={dna.reviewFlags} />}
          <DnaEditor brandId={brand.id} version={dna.version} initial={dna.profile} />
        </>
      )}
    </>
  );
}

function failureCopy(detail: string | null): string {
  const known = es.failures as Record<string, string>;
  return (detail && known[detail]) || es.failures.internal_error;
}

function Flags({ flags }: { flags: ReviewFlag[] }) {
  const fixed = es.flags as unknown as Record<string, string>;
  return (
    <section className="mt-6 border-l-4 border-chapa bg-chapa-fondo px-5 py-4" aria-labelledby="flags-title">
      <h2 id="flags-title" className="display text-2xl">
        {es.flags.title}
      </h2>
      <p className="mt-1 max-w-prose text-sm">{es.flags.lead}</p>
      <ul className="mt-3 grid gap-2">
        {flags.map((flag, index) => (
          <li key={index} className="rounded bg-raya px-3 py-2 text-sm">
            {flag.claim && <p className="font-semibold">{flag.claim}</p>}
            {/* Critic reasons are model-written; the other two have fixed copy. */}
            <p>{flag.source === "critic" ? flag.reason : (fixed[flag.reason] ?? flag.reason)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
