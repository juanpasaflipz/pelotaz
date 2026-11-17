import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { systemDb } from "@/db/client";
import { es } from "@/i18n/es";
import { isAdmin, listAccessRequests, type AccessRequest } from "@/lib/access-requests";
import { getAccessOrSetup } from "@/lib/auth/session";
import { appUrl } from "@/lib/publishing/runtime";
import { decide } from "./actions";

export const metadata: Metadata = { title: es.admin.title, robots: { index: false } };

export default function RequestsPage() {
  return (
    <main className="mx-auto max-w-4xl px-5 pb-24 pt-10">
      <h1 className="display text-5xl">{es.admin.title}</h1>
      <p className="mt-3 max-w-prose text-tinta-suave">{es.admin.lead}</p>
      <Suspense fallback={<div className="mt-8 h-40 rounded bg-borde/50" aria-hidden />}>
        <Requests />
      </Suspense>
    </main>
  );
}

async function Requests() {
  // Decided per request, never at build time: who is asking is the whole question.
  await connection();
  const access = await getAccessOrSetup();
  // Admins are addresses in ADMIN_EMAILS with a confirmed account. To anyone else this page does not exist.
  if (access.kind !== "ok" || !isAdmin(access.email)) notFound();
  const db = systemDb();
  const [pending, approved, rejected] = await Promise.all([
    listAccessRequests(db, "pending"),
    listAccessRequests(db, "approved"),
    listAccessRequests(db, "rejected"),
  ]);
  return (
    <>
      <Group title={es.admin.pending} rows={pending} />
      <Group title={es.admin.approved} rows={approved} />
      <Group title={es.admin.rejected} rows={rejected} />
    </>
  );
}

const day = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: "America/Mexico_City" });

function inviteLink(request: AccessRequest): string {
  const signUp = `${appUrl() ?? "https://www.pelotaz.com"}/auth/sign-up`;
  const query = new URLSearchParams({
    subject: es.admin.inviteSubject,
    body: es.admin.inviteBody(request.businessName, signUp, request.email),
  });
  // Mail apps expect %20 for spaces, not the "+" that URLSearchParams writes.
  return `mailto:${encodeURIComponent(request.email)}?${query.toString().replace(/\+/g, "%20")}`;
}

function Group({ title, rows }: { title: string; rows: AccessRequest[] }) {
  return (
    <section className="mt-10">
      <h2 className="display text-3xl">
        {title} <span className="text-tinta-suave">({rows.length})</span>
      </h2>
      {rows.length === 0 ? (
        <p className="mt-4 text-tinta-suave">{es.admin.none}</p>
      ) : (
        <ul className="mt-4 border-t-2 border-tinta">
          {rows.map((request) => (
            <li key={request.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-borde py-4">
              <div className="min-w-0">
                <p className="display truncate text-xl">{request.businessName}</p>
                <p className="truncate">{request.email}</p>
                <p className="truncate text-sm text-tinta-suave">
                  <a href={request.website} target="_blank" rel="noreferrer noopener" className="underline underline-offset-4">
                    {new URL(request.website).hostname}
                  </a>
                  {" · "}
                  {es.admin.asked(day.format(request.createdAt))}
                </p>
                {(request.source || request.utm) && (
                  <p className="truncate text-sm text-tinta-suave">
                    {es.admin.origin(request.source, request.utm)}
                  </p>
                )}
                {request.planInterest && (
                  <p className="text-sm font-semibold text-marca-profunda">
                    {es.admin.interest(request.planInterest, request.billingInterest)}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {request.status === "approved" && (
                  <a href={inviteLink(request)} className="button button-primary">
                    {es.admin.notify}
                  </a>
                )}
                {request.status !== "approved" && (
                  <Decision id={request.id} decision="approved" label={es.admin.approve} primary />
                )}
                {request.status !== "rejected" && (
                  <Decision
                    id={request.id}
                    decision="rejected"
                    label={request.status === "approved" ? es.admin.revoke : es.admin.reject}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Decision({ id, decision, label, primary }: { id: string; decision: "approved" | "rejected"; label: string; primary?: boolean }) {
  return (
    <form action={decide}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="decision" value={decision} />
      <button type="submit" className={`button ${primary ? "button-primary" : "button-quiet"}`}>
        {label}
      </button>
    </form>
  );
}
