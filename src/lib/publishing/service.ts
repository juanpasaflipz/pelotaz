import { and, asc, desc, eq, inArray, lte, ne, sql } from "drizzle-orm";
import { assets, brands, connections, contentItems, drafts, metricsDaily, publications } from "@/db/schema";
import { withTenant, type Db, type TenantTx } from "@/db/tenant";
import { decrypt, encrypt } from "@/lib/meta/secrets";
import { MetaApiError, type GraphClient, type ManagedPage, type Published } from "@/lib/meta/graph";

export type Channel = "instagram" | "facebook";

interface StoredTokens {
  /** Page access token; also used for the Page's Instagram account. */
  token: string;
}

export interface ConnectionView {
  id: string;
  channel: Channel;
  name: string | null;
  status: string;
}

/**
 * Store the Pages (and their Instagram accounts) a person manages for this
 * brand. With one Page it is connected at once; with several, the owner picks
 * which one the brand publishes to.
 */
export async function saveConnections(
  db: Db,
  tenantId: string,
  brandId: string,
  pages: ManagedPage[],
): Promise<{ pages: number; active: boolean }> {
  return withTenant(db, tenantId, async (tx) => {
    const [brand] = await tx.select({ id: brands.id }).from(brands).where(eq(brands.id, brandId));
    if (!brand) throw new Error("Unknown brand");
    const single = pages.length === 1;
    if (single) {
      // A fresh single-Page login replaces whatever the brand used before.
      await tx
        .update(connections)
        .set({ status: "available" })
        .where(and(eq(connections.brandId, brandId), eq(connections.status, "active")));
    }
    for (const page of pages) {
      const rows = [
        { channel: "facebook", externalAccountId: page.id, displayName: page.name, parentAccountId: null },
        ...(page.instagram
          ? [
              {
                channel: "instagram",
                externalAccountId: page.instagram.id,
                displayName: page.instagram.username ? `@${page.instagram.username}` : page.name,
                parentAccountId: page.id,
              },
            ]
          : []),
      ];
      for (const row of rows) {
        const encryptedTokens = encrypt(JSON.stringify({ token: page.accessToken } satisfies StoredTokens));
        const status = single ? "active" : "available";
        await tx
          .insert(connections)
          .values({ tenantId, brandId, ...row, encryptedTokens, status })
          .onConflictDoUpdate({
            target: [connections.brandId, connections.channel, connections.externalAccountId],
            set: {
              encryptedTokens,
              displayName: row.displayName,
              parentAccountId: row.parentAccountId,
              // Reconnecting an account the brand already uses keeps it in use.
              status: single ? "active" : sql`case when ${connections.status} = 'active' then 'active' else 'available' end`,
              updatedAt: new Date(),
            },
          });
      }
    }
    return { pages: pages.length, active: single };
  });
}

/** Use this Page (and its Instagram account) for the brand. */
export async function chooseFacebookPage(db: Db, tenantId: string, brandId: string, connectionId: string) {
  return withTenant(db, tenantId, async (tx) => {
    const [page] = await tx
      .select()
      .from(connections)
      .where(and(eq(connections.id, connectionId), eq(connections.brandId, brandId), eq(connections.channel, "facebook")));
    if (!page || page.status === "disconnected") return false;
    await tx
      .update(connections)
      .set({ status: "available" })
      .where(and(eq(connections.brandId, brandId), eq(connections.status, "active")));
    await tx.update(connections).set({ status: "active" }).where(eq(connections.id, page.id));
    await tx
      .update(connections)
      .set({ status: "active" })
      .where(
        and(
          eq(connections.brandId, brandId),
          eq(connections.channel, "instagram"),
          eq(connections.parentAccountId, page.externalAccountId),
          ne(connections.status, "disconnected"),
        ),
      );
    return true;
  });
}

/** Stop publishing for the brand and forget the tokens. Past publications keep their record. */
export async function disconnectMeta(db: Db, tenantId: string, brandId: string) {
  await withTenant(db, tenantId, async (tx) => {
    await tx
      .update(connections)
      .set({ status: "disconnected", encryptedTokens: "" })
      .where(eq(connections.brandId, brandId));
    // Nothing goes out through an account that is no longer connected.
    await tx
      .update(contentItems)
      .set({ status: "approved", scheduledAt: null })
      .where(and(eq(contentItems.brandId, brandId), eq(contentItems.status, "scheduled")));
  });
}

export async function listConnections(db: Db, tenantId: string, brandId: string): Promise<ConnectionView[]> {
  return withTenant(db, tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(connections)
      .where(and(eq(connections.brandId, brandId), ne(connections.status, "disconnected")))
      .orderBy(asc(connections.channel), asc(connections.displayName));
    return rows.map((row) => ({
      id: row.id,
      channel: row.channel as Channel,
      name: row.displayName,
      status: row.status,
    }));
  });
}

export async function activeConnection(tx: TenantTx, brandId: string, channel: string) {
  const [row] = await tx
    .select()
    .from(connections)
    .where(and(eq(connections.brandId, brandId), eq(connections.channel, channel), eq(connections.status, "active")))
    .limit(1);
  return row ?? null;
}

export interface PublishDeps {
  db: Db;
  graph: GraphClient;
  /** Public JPEG URL for an asset, in the shape the format needs. */
  mediaUrl: (assetId: string, format: "feed" | "story") => string;
  now?: () => Date;
}

/** Posts stuck in `publishing` this long are treated as unknown, never retried blindly. */
const STUCK_AFTER_MINUTES = 30;

/**
 * Take due posts for publishing. Runs as the table owner across tenants (it
 * is a scheduler), and marks each row `publishing` so a second run in
 * parallel cannot take the same post.
 */
async function claimDue(db: Db, now: Date, limit: number) {
  const due = (await db.execute(sql`
    update content_items set status = 'publishing'
    where id in (
      select id from content_items
      where status = 'scheduled' and scheduled_at <= ${now.toISOString()}
      order by scheduled_at
      limit ${limit}
      for update skip locked
    )
    returning id, tenant_id
  `)) as unknown as { rows: Array<{ id: string; tenant_id: string }> };
  return due.rows.map((row) => ({ id: row.id, tenantId: row.tenant_id }));
}

/** A post left in `publishing` (a crash mid-send) may or may not be live; ask the owner. */
async function releaseStuck(db: Db, now: Date) {
  const cutoff = new Date(now.getTime() - STUCK_AFTER_MINUTES * 60_000);
  const stuck = await db
    .update(contentItems)
    .set({ status: "approved", scheduledAt: null })
    .where(and(eq(contentItems.status, "publishing"), lte(contentItems.scheduledAt, cutoff)))
    .returning({ id: contentItems.id, tenantId: contentItems.tenantId, brandId: contentItems.brandId });
  for (const item of stuck) {
    await withTenant(db, item.tenantId, async (tx) => {
      const [anyConnection] = await tx.select({ id: connections.id }).from(connections).where(eq(connections.brandId, item.brandId)).limit(1);
      if (!anyConnection) return;
      await tx.insert(publications).values({
        tenantId: item.tenantId,
        brandId: item.brandId,
        contentItemId: item.id,
        connectionId: anyConnection.id,
        error: "unknown_state",
      }).onConflictDoUpdate({
        target: [publications.contentItemId, publications.connectionId],
        set: { error: "unknown_state" },
      });
    });
  }
}

export type PublishResult = { itemId: string; ok: true; permalink: string | null } | { itemId: string; ok: false; error: string };

async function publishOne(deps: PublishDeps, tenantId: string, itemId: string): Promise<PublishResult> {
  const { db, graph } = deps;
  const loaded = await withTenant(db, tenantId, async (tx) => {
    const [item] = await tx.select().from(contentItems).where(eq(contentItems.id, itemId));
    if (!item) return null;
    const [draft] = await tx
      .select()
      .from(drafts)
      .where(eq(drafts.contentItemId, itemId))
      .orderBy(desc(drafts.version))
      .limit(1);
    const connection = await activeConnection(tx, item.brandId, item.channel);
    const assetId = draft?.assetIds[0] ?? null;
    const [asset] = assetId ? await tx.select().from(assets).where(eq(assets.id, assetId)) : [];
    return { item, draft, connection, asset: asset ?? null };
  });
  if (!loaded) return { itemId, ok: false, error: "not_found" };
  const { item, draft, connection, asset } = loaded;

  const finish = async (result: { published?: Published; error?: string }, connectionId: string | null) => {
    await withTenant(db, tenantId, async (tx) => {
      if (connectionId) {
        // One record per post and account: a retry after a failure updates it.
        const outcome = {
          externalId: result.published?.id ?? null,
          permalink: result.published?.permalink ?? null,
          publishedAt: result.published ? (deps.now?.() ?? new Date()) : null,
          error: result.error ?? null,
        };
        await tx
          .insert(publications)
          .values({ tenantId, brandId: item.brandId, contentItemId: item.id, connectionId, ...outcome })
          .onConflictDoUpdate({ target: [publications.contentItemId, publications.connectionId], set: outcome });
      }
      await tx
        .update(contentItems)
        .set(
          result.published
            ? { status: "published" }
            : // Back to the owner: approved, not scheduled, with the error on record.
              { status: "approved", scheduledAt: null },
        )
        .where(eq(contentItems.id, item.id));
    });
  };

  if (!draft) {
    await finish({ error: "no_draft" }, null);
    return { itemId, ok: false, error: "no_draft" };
  }
  if (!connection || !connection.encryptedTokens) {
    await finish({ error: "not_connected" }, null);
    return { itemId, ok: false, error: "not_connected" };
  }
  const story = item.format === "story";
  if (item.channel === "instagram" && !asset) {
    await finish({ error: "needs_photo" }, connection.id);
    return { itemId, ok: false, error: "needs_photo" };
  }

  try {
    const { token } = JSON.parse(decrypt(connection.encryptedTokens)) as StoredTokens;
    const imageUrl = asset ? deps.mediaUrl(asset.id, story ? "story" : "feed") : null;
    const published =
      item.channel === "instagram"
        ? await graph.publishInstagram(connection.externalAccountId, token, {
            imageUrl: imageUrl!,
            caption: draft.copy,
            story,
          })
        : await graph.publishFacebook(connection.externalAccountId, token, { imageUrl, caption: draft.copy });
    await finish({ published }, connection.id);
    return { itemId, ok: true, permalink: published.permalink };
  } catch (error) {
    const reconnect = error instanceof MetaApiError && error.needsReconnect;
    const message = reconnect ? "reconnect" : error instanceof Error ? error.message.slice(0, 300) : "unknown";
    console.error("publish failed", { itemId, channel: item.channel, error: message });
    if (reconnect) {
      await withTenant(db, tenantId, (tx) =>
        tx.update(connections).set({ status: "expired" }).where(eq(connections.id, connection.id)),
      );
    }
    await finish({ error: message }, connection.id);
    return { itemId, ok: false, error: message };
  }
}

/** Publish everything due. Called by the scheduler every few minutes, and by "publicar ahora". */
export async function publishDue(deps: PublishDeps, limit = 10): Promise<PublishResult[]> {
  const now = deps.now?.() ?? new Date();
  await releaseStuck(deps.db, now);
  const due = await claimDue(deps.db, now, limit);
  const results: PublishResult[] = [];
  for (const item of due) results.push(await publishOne(deps, item.tenantId, item.id));
  return results;
}

/** Latest publication per item, for the week page. */
export async function latestPublications(db: Db, tenantId: string, itemIds: string[]) {
  if (itemIds.length === 0) return new Map<string, typeof publications.$inferSelect>();
  return withTenant(db, tenantId, async (tx) => {
    const rows = await tx
      .selectDistinctOn([publications.contentItemId])
      .from(publications)
      .where(inArray(publications.contentItemId, itemIds))
      .orderBy(publications.contentItemId, desc(publications.createdAt));
    return new Map(rows.map((row) => [row.contentItemId, row]));
  });
}

export interface ResultsDeps {
  db: Db;
  graph: GraphClient;
  now?: () => Date;
}

/** Posts are followed for this long after publishing; most results arrive in the first days. */
const FOLLOW_DAYS = 30;

/**
 * Fetch today's results for published posts that do not have them yet, and
 * store them as that day's snapshot. Cross-tenant (a scheduler); each write
 * goes through the post's tenant.
 */
export async function collectResults(deps: ResultsDeps, limit = 40): Promise<{ updated: number; failed: number }> {
  const now = deps.now?.() ?? new Date();
  const day = now.toISOString().slice(0, 10);
  const due = (await deps.db.execute(sql`
    select p.id, p.tenant_id, p.brand_id, p.external_id, c.channel, c.encrypted_tokens, i.format
    from publications p
    join connections c on c.id = p.connection_id
    join content_items i on i.id = p.content_item_id
    where p.external_id is not null
      and p.published_at > ${new Date(now.getTime() - FOLLOW_DAYS * 86_400_000).toISOString()}
      and p.published_at < ${new Date(now.getTime() - 60 * 60_000).toISOString()}
      and c.status = 'active' and c.encrypted_tokens <> ''
      and not exists (select 1 from metrics_daily m where m.publication_id = p.id and m.day = ${day})
    order by p.published_at desc
    limit ${limit}
  `)) as unknown as {
    rows: Array<{
      id: string;
      tenant_id: string;
      brand_id: string;
      external_id: string;
      channel: string;
      encrypted_tokens: string;
      format: string;
    }>;
  };

  let updated = 0;
  let failed = 0;
  for (const row of due.rows) {
    try {
      const { token } = JSON.parse(decrypt(row.encrypted_tokens)) as StoredTokens;
      const results =
        row.channel === "instagram"
          ? await deps.graph.instagramResults(row.external_id, token, row.format === "story")
          : await deps.graph.facebookResults(row.external_id, token);
      await withTenant(deps.db, row.tenant_id, (tx) =>
        tx
          .insert(metricsDaily)
          .values({ tenantId: row.tenant_id, brandId: row.brand_id, publicationId: row.id, day, ...results, fetchedAt: now })
          .onConflictDoUpdate({
            target: [metricsDaily.publicationId, metricsDaily.day],
            set: { ...results, fetchedAt: now },
          }),
      );
      updated += 1;
    } catch (error) {
      failed += 1;
      console.error("results failed", {
        publicationId: row.id,
        error: error instanceof Error ? error.message.slice(0, 200) : "unknown",
      });
    }
  }
  return { updated, failed };
}

export interface PostResultsView {
  views: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  interactions: number | null;
  day: string;
}

/** Latest results per content item. */
export async function latestResults(db: Db, tenantId: string, itemIds: string[]) {
  if (itemIds.length === 0) return new Map<string, PostResultsView>();
  return withTenant(db, tenantId, async (tx) => {
    const rows = await tx
      .selectDistinctOn([publications.contentItemId], {
        itemId: publications.contentItemId,
        day: metricsDaily.day,
        views: metricsDaily.views,
        reach: metricsDaily.reach,
        likes: metricsDaily.likes,
        comments: metricsDaily.comments,
        shares: metricsDaily.shares,
        saves: metricsDaily.saves,
        interactions: metricsDaily.interactions,
      })
      .from(metricsDaily)
      .innerJoin(publications, eq(publications.id, metricsDaily.publicationId))
      .where(inArray(publications.contentItemId, itemIds))
      .orderBy(publications.contentItemId, desc(metricsDaily.day));
    return new Map(rows.map(({ itemId, ...rest }) => [itemId, rest]));
  });
}
