import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AccessNotice } from "@/components/access-notice";
import { NewBrandForm } from "@/components/new-brand-form";
import { SetupNotice } from "@/components/setup-notice";
import { StatusLabel } from "@/components/status-label";
import { es } from "@/i18n/es";
import { getAccessOrSetup } from "@/lib/auth/session";
import { listBrands } from "@/lib/data";

// Creating a brand can run the crawl in-process in local development.
export const maxDuration = 300;

export default function HomePage() {
  return (
    <main>
      <section className="wall">
        <div className="mx-auto max-w-4xl px-5 pb-12 pt-10">
          <h1 className="display max-w-2xl text-5xl sm:text-7xl">{es.home.title}</h1>
          <p className="mt-4 max-w-xl text-lg">{es.home.lead}</p>
          <Suspense fallback={null}>
            <BrandForm />
          </Suspense>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-5 py-12">
        <Suspense fallback={<div className="mt-6 h-24 rounded bg-borde/50" aria-hidden />}>
          <Workspace />
        </Suspense>
      </section>
    </main>
  );
}

/**
 * The form appears only when the person may act on a workspace; otherwise
 * the section below says why (unconfirmed, uninvited). Showing it anyway
 * offers a submission the server would refuse.
 */
async function BrandForm() {
  await connection();
  const access = await getAccessOrSetup();
  return access.kind === "ok" ? <NewBrandForm /> : null;
}

async function Workspace() {
  await connection();
  const access = await getAccessOrSetup();
  if (access.kind === "setup") return <SetupNotice />;
  if (access.kind === "signed_out") redirect("/auth/sign-in");
  if (access.kind !== "ok") return <AccessNotice kind={access.kind} email={access.email} />;
  const brands = await listBrands(access.tenantId);
  return (
    <>
      <h2 className="display text-3xl">{es.home.listTitle}</h2>
      <BrandItems brands={brands} />
    </>
  );
}

function BrandItems({ brands }: { brands: Awaited<ReturnType<typeof listBrands>> }) {

  if (brands.length === 0) {
    return <p className="mt-6 max-w-prose text-tinta-suave">{es.home.empty}</p>;
  }

  return (
    <ul className="mt-6 border-t-2 border-tinta">
      {brands.map((brand) => (
        <li key={brand.id} className="border-b border-borde">
          <Link
            href={`/brands/${brand.id}`}
            className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-4 hover:bg-raya"
          >
            <span className="min-w-0">
              <span className="display block truncate text-2xl">{brand.name}</span>
              <span className="block truncate text-sm text-tinta-suave">
                {new URL(brand.sourceUrl).hostname}
              </span>
            </span>
            <StatusLabel status={brand.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
