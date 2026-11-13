import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { AccessNotice } from "@/components/access-notice";
import { SetupNotice } from "@/components/setup-notice";
import { PlanButton } from "@/components/week/plan-button";
import { PlanProgress } from "@/components/week/plan-progress";
import { PostCard } from "@/components/week/post-card";
import { LearningPanel } from "@/components/week/learning-panel";
import { ChannelsPanel } from "@/components/week/channels-panel";
import { DEFAULT_PUBLISH_TIME } from "@/lib/content/service";
import { timeZoneOf, utcToLocalTime } from "@/lib/markets";
import { isPublishingConfigured } from "@/lib/publishing/runtime";
import { latestPublications, listConnections } from "@/lib/publishing/service";
import { currentValue } from "@/lib/learning/changes";
import { hasNewEdits, pendingProposal } from "@/lib/learning/service";
import { systemDb } from "@/db/client";
import { es } from "@/i18n/es";
import { getAccessOrSetup } from "@/lib/auth/session";
import { latestWeek } from "@/lib/content/service";
import { getBrandWithDna } from "@/lib/data";

// Planning runs after the response, in this function: one planning call and
// two calls per post.
export const maxDuration = 300;

const t = es.week;

const dayLabel = (date: string) =>
  new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );
const weekLabel = (date: string) =>
  new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );

export default function WeekPage({ params, searchParams }: PageProps<"/brands/[id]/semana">) {
  return (
    <main className="mx-auto max-w-4xl px-5 pb-24 pt-8">
      <Suspense fallback={<div className="mt-6 h-40 rounded bg-borde/50" aria-hidden />}>
        <WeekView params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function WeekView({ params, searchParams }: Pick<PageProps<"/brands/[id]/semana">, "params" | "searchParams">) {
  const { id } = await params;
  const metaResult = (await searchParams).meta;
  const access = await getAccessOrSetup();
  if (access.kind === "setup") return <SetupNotice />;
  if (access.kind === "signed_out") redirect("/auth/sign-in");
  if (access.kind !== "ok") return <AccessNotice kind={access.kind} email={access.email} />;
  const data = await getBrandWithDna(access.tenantId, id);
  if (!data) notFound();
  const { brand } = data;
  const publishing = isPublishingConfigured();
  const [week, newEdits, proposal, connections] = await Promise.all([
    latestWeek(systemDb(), access.tenantId, brand.id),
    hasNewEdits(systemDb(), access.tenantId, brand.id),
    pendingProposal(systemDb(), access.tenantId, brand.id),
    publishing ? listConnections(systemDb(), access.tenantId, brand.id) : Promise.resolve([]),
  ]);
  const published = await latestPublications(
    systemDb(),
    access.tenantId,
    week?.items.map(({ item }) => item.id) ?? [],
  );
  const connectedChannels = new Set(connections.filter((c) => c.status === "active").map((c) => c.channel as string));
  const whenLabel = (instant: Date) =>
    new Intl.DateTimeFormat("es-MX", {
      timeZone: timeZoneOf(brand.country),
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(instant);

  const drafting = week?.items.filter(({ item }) => item.status === "drafting").length ?? 0;
  const running = week && (["queued", "planning", "drafting"].includes(week.plan.status) || drafting > 0);
  const approved = week?.items.filter(({ item }) => item.status === "approved").length ?? 0;

  return (
    <>
      <Link
        href={`/brands/${brand.id}`}
        className="text-sm font-medium text-tinta-suave underline underline-offset-4"
      >
        {brand.name}
      </Link>
      <h1 className="display mt-4 text-5xl sm:text-6xl">{t.title}</h1>
      {week && <p className="mt-2 text-tinta-suave">{t.weekOf(weekLabel(week.plan.weekStart))}</p>}
      <p className="mt-3 max-w-prose">{t.lead}</p>

      {brand.status !== "ready" && <p className="mt-8 font-medium">{t.profileFirst}</p>}

      {brand.status === "ready" && !week && (
        <div className="mt-8 rounded-md bg-raya p-5">
          <p className="max-w-prose">{t.empty}</p>
          <div className="mt-4">
            <PlanButton brandId={brand.id} label={t.plan} primary />
          </div>
        </div>
      )}

      {week && running && (
        <PlanProgress
          brandId={brand.id}
          initial={{ status: week.plan.status, total: week.items.length, drafting }}
        />
      )}

      {week?.plan.status === "failed" && (
        <div className="mt-8 border-l-4 border-chapa bg-chapa-fondo px-5 py-4" role="alert">
          <p className="display text-2xl text-chapa">{t.failed}</p>
          <p className="mt-1">{t.failures[week.plan.statusDetail ?? ""] ?? t.failures.internal_error}</p>
          <div className="mt-4">
            <PlanButton brandId={brand.id} label={t.retry} primary />
          </div>
        </div>
      )}

      {publishing && brand.status === "ready" && (
        <ChannelsPanel
          brandId={brand.id}
          connections={connections}
          result={typeof metaResult === "string" ? metaResult : null}
        />
      )}

      <LearningPanel
        brandId={brand.id}
        newEdits={newEdits}
        proposal={
          proposal && {
            id: proposal.id,
            summary: proposal.summary,
            changes: proposal.changes.map((change) => ({
              target: change.target,
              op: change.op,
              offerName: change.offerName,
              before: change.op === "add" ? null : currentValue(proposal.profile, change),
              after: change.op === "remove" ? null : change.newValue,
              reason: change.reason,
              evidence: change.evidence,
            })),
          }
        }
      />

      {week && week.plan.rationale && (
        <section className="mt-8 border-l-4 border-pelota bg-raya px-5 py-4">
          <h2 className="font-semibold">{t.why}</h2>
          <p className="mt-1 max-w-prose">{week.plan.rationale}</p>
        </section>
      )}

      {week && week.items.length > 0 && (
        <>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm font-medium">{t.summary(approved, week.items.length)}</p>
            {!running && brand.status === "ready" && approved === 0 && (
              <div className="flex items-center gap-3">
                <p className="hidden max-w-xs text-right text-sm text-tinta-suave sm:block">{t.replanHint}</p>
                <PlanButton brandId={brand.id} label={t.replan} />
              </div>
            )}
          </div>
          <div className="mt-4 grid gap-6">
            {week.items.map(({ item, brief, draft }) => (
              <PostCard
                key={item.id}
                itemId={item.id}
                status={item.status}
                channel={item.channel}
                format={item.format}
                dateLabel={dayLabel(brief.date)}
                pillar={brief.pillar}
                topic={brief.topic}
                offerName={brief.offerName}
                occasion={brief.occasion?.name ?? null}
                draft={
                  draft && {
                    version: draft.version,
                    copy: draft.copy,
                    assetId: draft.assetIds[0] ?? null,
                    mine: draft.source === "user_edit",
                    flags: draft.reviewFlags,
                  }
                }
                images={week.images}
                publishing={{
                  connected: connectedChannels.has(item.channel),
                  scheduledLabel: item.scheduledAt ? whenLabel(item.scheduledAt) : null,
                  time: item.scheduledAt ? utcToLocalTime(item.scheduledAt, brand.country) : DEFAULT_PUBLISH_TIME,
                  permalink: published.get(item.id)?.permalink ?? null,
                  error: published.get(item.id)?.error ?? null,
                }}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}
