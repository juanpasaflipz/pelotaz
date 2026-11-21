import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { systemDb } from "@/db/client";
import { es } from "@/i18n/es";
import { isAdmin } from "@/lib/access-requests";
import { getAccessOrSetup } from "@/lib/auth/session";
import { funnelTotals, signupFunnel, type FunnelRow } from "@/lib/funnel";

const t = es.admin.funnel;

export const metadata: Metadata = { title: t.title, robots: { index: false } };

export default function FunnelPage() {
  return (
    <main className="mx-auto max-w-5xl px-5 pb-24 pt-10">
      <h1 className="display text-5xl">{t.title}</h1>
      <p className="mt-3 max-w-prose text-tinta-suave">{t.lead}</p>
      <p className="mt-3">
        <Link href="/admin/solicitudes" className="font-semibold underline underline-offset-4">
          {t.back}
        </Link>
      </p>
      <Suspense fallback={<div className="mt-8 h-40 rounded bg-borde/50" aria-hidden />}>
        <Funnel />
      </Suspense>
    </main>
  );
}

async function Funnel() {
  await connection();
  const access = await getAccessOrSetup();
  // Same rule as the requests page: to anyone but an admin this page does not exist.
  if (access.kind !== "ok" || !isAdmin(access.email)) notFound();
  const db = systemDb();
  const [week, month] = await Promise.all([signupFunnel(db, 7), signupFunnel(db, 30)]);
  return (
    <>
      <Table title={t.window(7)} rows={week} />
      <Table title={t.window(30)} rows={month} />
    </>
  );
}

const COLUMNS = [
  "requests",
  "approved",
  "automatic",
  "accounts",
  "profiles",
  "plans",
  "approvedPost",
  "publishedPost",
] as const satisfies ReadonlyArray<keyof FunnelRow>;

const number = new Intl.NumberFormat("es-MX");

function Table({ title, rows }: { title: string; rows: FunnelRow[] }) {
  const total = funnelTotals(rows);
  return (
    <section className="mt-10">
      <h2 className="display text-3xl">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-4 text-tinta-suave">{t.none}</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[44rem] border-t-2 border-tinta text-left text-sm">
            <thead>
              <tr className="border-b border-borde">
                <th scope="col" className="py-2 pr-4 font-semibold">
                  {t.columns.origin}
                </th>
                {COLUMNS.map((key) => (
                  <th key={key} scope="col" className="py-2 pr-4 text-right font-semibold">
                    {t.columns[key]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.origin} className="border-b border-borde">
                  <th scope="row" className="py-2 pr-4 font-normal">
                    {row.origin}
                  </th>
                  {COLUMNS.map((key) => (
                    <td key={key} className="py-2 pr-4 text-right tabular-nums">
                      {number.format(row[key])}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="font-semibold">
                <th scope="row" className="py-2 pr-4">
                  {t.total}
                </th>
                {COLUMNS.map((key) => (
                  <td key={key} className="py-2 pr-4 text-right tabular-nums">
                    {number.format(total[key])}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
