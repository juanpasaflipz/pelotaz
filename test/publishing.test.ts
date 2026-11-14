import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { brands, connections, contentItems, publications } from "@/db/schema";
import { withTenant, type Db } from "@/db/tenant";
import { onboardBrand } from "@/lib/brand-dna/service";
import { latestWeek, publishNow, requestPlan, runPlan, saveItem, type ContentLimits } from "@/lib/content/service";
import { localToUtc } from "@/lib/markets";
import { createGraphClient, loginUrl, MetaApiError, type FetchLike, type GraphClient, type ManagedPage } from "@/lib/meta/graph";
import { decrypt, encrypt, sign, verify } from "@/lib/meta/secrets";
import {
  chooseFacebookPage,
  disconnectMeta,
  listConnections,
  publishDue,
  saveConnections,
  type PublishDeps,
} from "@/lib/publishing/service";
import { createFixtureFetcher, ORIGIN } from "./fixtures/site";
import { createTenant, createTestDb } from "./helpers/db";
import { createFakeLlm, faithfulLlm } from "./helpers/llm";

let db: Db;
let close: () => Promise<void>;
let tenantId: string;
let otherTenantId: string;

const LIMITS: ContentLimits = { plansPerDay: 50, rewritesPerDay: 50, learnPerDay: 50 };

const PAGE: ManagedPage = {
  id: "page-1",
  name: "La Brasa",
  accessToken: "page-token-1",
  instagram: { id: "ig-1", username: "labrasa" },
};

function fakeGraph(fail?: () => Error) {
  const calls: Array<{ kind: string; account: string; token: string; input: unknown }> = [];
  const graph = {
    async userToken() {
      return "user";
    },
    async pages() {
      return [PAGE];
    },
    async publishInstagram(account: string, token: string, input: unknown) {
      calls.push({ kind: "instagram", account, token, input });
      if (fail) throw fail();
      return { id: `ig-media-${calls.length}`, permalink: `https://instagram.com/p/${calls.length}` };
    },
    async publishFacebook(account: string, token: string, input: unknown) {
      calls.push({ kind: "facebook", account, token, input });
      if (fail) throw fail();
      return { id: `fb-${calls.length}`, permalink: `https://facebook.com/fb-${calls.length}` };
    },
  } as unknown as GraphClient;
  return { graph, calls };
}

const deps = (graph: GraphClient, now?: Date): PublishDeps => ({
  db,
  graph,
  mediaUrl: (assetId, format) => `https://app.example/api/media/${assetId}?f=${format}`,
  now: now ? () => now : undefined,
});

/** A ready brand with a planned week: Tuesday Instagram post with a photo, Thursday story with none, Saturday Facebook post. */
async function plannedBrand(owner = tenantId) {
  const brandId = await withTenant(db, owner, async (tx) => {
    const [row] = await tx.insert(brands).values({ tenantId: owner, name: "labrasa", sourceUrl: ORIGIN }).returning();
    return row.id;
  });
  await onboardBrand({ db, fetcher: createFixtureFetcher(), llm: faithfulLlm() }, owner, brandId);
  const request = await requestPlan(db, owner, brandId, LIMITS);
  if (request.state !== "started") throw new Error(request.state);
  const base = { pillar: "product", angle: "x", offerName: null, callToAction: "Pide", occasion: null };
  await runPlan(
    {
      db,
      llm: createFakeLlm({
        "content.plan": () => ({
          rationale: "x",
          posts: [
            { ...base, day: "tue", channel: "instagram", format: "post", topic: "Pastor", imageNumber: 1 },
            { ...base, day: "thu", channel: "instagram", format: "story", topic: "Arrachera", imageNumber: null },
            { ...base, day: "sat", channel: "facebook", format: "post", topic: "Barrio", imageNumber: null },
          ],
        }),
        "content.draft": () => ({ caption: "Tacos al pastor. Pide hoy.", hashtags: [] }),
        "content.critique": () => ({ flags: [] }),
      }),
    },
    owner,
    request.planId,
  );
  const week = (await latestWeek(db, owner, brandId))!;
  return { brandId, week };
}

const approve = (itemId: string, draft: { copy: string; assetIds: string[] }, owner = tenantId) =>
  saveItem(db, owner, itemId, { copy: draft.copy, assetId: draft.assetIds[0] ?? null, decision: "approve", publishTime: "12:30" });

beforeAll(async () => {
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  ({ db, close } = await createTestDb());
  tenantId = await createTenant(db, "La Brasa");
  otherTenantId = await createTenant(db, "Otra");
});

afterAll(async () => {
  await close();
});

describe("secrets", () => {
  it("encrypts tokens and rejects tampering", () => {
    const sealed = encrypt("secret-token");
    expect(sealed).not.toContain("secret-token");
    expect(decrypt(sealed)).toBe("secret-token");
    const [v, iv, tag, body] = sealed.split(".");
    const flipped = `${v}.${iv}.${tag}.${body.slice(0, -2)}${body.endsWith("A") ? "B" : "A"}A`;
    expect(() => decrypt(flipped)).toThrow();
  });

  it("signs the OAuth state and refuses forged or expired ones", () => {
    const state = sign({ tenantId: "t", brandId: "b", nonce: "n" });
    expect(verify<{ brandId: string }>(state)?.brandId).toBe("b");
    const [body] = state.split(".");
    const forged = Buffer.from(JSON.stringify({ tenantId: "x", brandId: "b", nonce: "n", exp: 9e9 })).toString("base64url");
    expect(verify(`${forged}.${state.split(".")[1]}`)).toBeNull();
    expect(verify(`${body}.AAAA`)).toBeNull();
    expect(verify(sign({ a: 1 }, -1))).toBeNull();
  });
});

describe("Graph client", () => {
  it("builds the login URL with the publishing permissions", () => {
    const url = new URL(loginUrl({ appId: "123", appSecret: "s" }, "https://app.example/cb", "st"));
    expect(url.hostname).toBe("www.facebook.com");
    expect(url.searchParams.get("scope")).toContain("instagram_content_publish");
    expect(url.searchParams.get("scope")).toContain("pages_manage_posts");
    const withConfig = new URL(loginUrl({ appId: "123", appSecret: "s", loginConfigId: "cfg" }, "https://x/cb", "st"));
    expect(withConfig.searchParams.get("config_id")).toBe("cfg");
    expect(withConfig.searchParams.has("scope")).toBe(false);
  });

  it("publishes an Instagram photo: container, status, publish, permalink", async () => {
    const requests: Array<{ url: string; method: string; body: Record<string, string> }> = [];
    const replies = [{ id: "container" }, { status_code: "IN_PROGRESS" }, { status_code: "FINISHED" }, { id: "media" }, { permalink: "https://instagram.com/p/x" }];
    const fetchImpl: FetchLike = async (url, init) => {
      requests.push({ url, method: init?.method ?? "GET", body: Object.fromEntries(init?.body ?? []) });
      return { ok: true, status: 200, json: async () => replies.shift() };
    };
    const graph = createGraphClient({ appId: "a", appSecret: "s" }, fetchImpl);
    const result = await graph.publishInstagram("ig", "tok", { imageUrl: "https://x/i.jpg", caption: "Hola", story: false }, async () => {});
    expect(result).toEqual({ id: "media", permalink: "https://instagram.com/p/x" });
    expect(requests[0]).toMatchObject({ method: "POST", body: { image_url: "https://x/i.jpg", caption: "Hola" } });
    expect(requests[0].url).toMatch(/^https:\/\/graph\.facebook\.com\/v\d+\.\d+\/ig\/media$/);
    expect(requests[3]).toMatchObject({ method: "POST", body: { creation_id: "container" } });
  });

  it("sends stories without a caption, and reports token errors as needing reconnection", async () => {
    const bodies: Array<Record<string, string>> = [];
    let first = true;
    const fetchImpl: FetchLike = async (_url, init) => {
      bodies.push(Object.fromEntries(init?.body ?? []));
      if (first) {
        first = false;
        return { ok: true, status: 200, json: async () => ({ id: "c" }) };
      }
      return { ok: false, status: 400, json: async () => ({ error: { message: "Session expired", code: 190 } }) };
    };
    const graph = createGraphClient({ appId: "a", appSecret: "s" }, fetchImpl);
    const error = await graph
      .publishInstagram("ig", "tok", { imageUrl: "https://x/i.jpg", caption: "Hola", story: true }, async () => {})
      .catch((e) => e);
    expect(bodies[0]).toMatchObject({ media_type: "STORIES" });
    expect(bodies[0].caption).toBeUndefined();
    expect(error).toBeInstanceOf(MetaApiError);
    expect((error as MetaApiError).needsReconnect).toBe(true);
  });
});

describe("finding the Pages to publish to", () => {
  it("falls back to the Pages granted in the login dialog when me/accounts is empty", async () => {
    const urls: string[] = [];
    const fetchImpl: FetchLike = async (url) => {
      urls.push(url);
      const path = new URL(url).pathname.split("/").slice(2).join("/");
      const reply =
        path === "me/accounts"
          ? { data: [] }
          : path === "debug_token"
            ? {
                data: {
                  granular_scopes: [
                    { scope: "pages_show_list", target_ids: ["111"] },
                    { scope: "pages_manage_posts", target_ids: ["111", "222"] },
                    { scope: "instagram_basic", target_ids: ["ig-9"] },
                  ],
                },
              }
            : path === "111"
              ? { id: "111", name: "Juanberto's", access_token: "pt-111", instagram_business_account: { id: "ig-9", username: "juanbertos" } }
              : { id: "222", name: "Sin token" };
      return { ok: true, status: 200, json: async () => reply };
    };
    const graph = createGraphClient({ appId: "app", appSecret: "secret" }, fetchImpl);
    expect(await graph.pages("user-token")).toEqual([
      { id: "111", name: "Juanberto's", accessToken: "pt-111", instagram: { id: "ig-9", username: "juanbertos" } },
    ]);
    // The app token goes only to debug_token; Instagram ids are never fetched as Pages.
    expect(urls.some((url) => url.includes("/ig-9?"))).toBe(false);
    expect(urls.find((url) => url.includes("debug_token"))).toContain("access_token=app%7Csecret");
  });

  it("uses me/accounts when it lists Pages", async () => {
    const fetchImpl: FetchLike = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: "1", name: "P", access_token: "t" }] }),
    });
    const graph = createGraphClient({ appId: "a", appSecret: "s" }, fetchImpl);
    expect(await graph.pages("u")).toEqual([{ id: "1", name: "P", accessToken: "t", instagram: null }]);
  });
});

describe("time zones", () => {
  it("turns a brand-local time into the right instant", () => {
    expect(localToUtc("2026-11-17", "12:30", "MX").toISOString()).toBe("2026-11-17T18:30:00.000Z");
    expect(localToUtc("2026-07-01", "12:00", "ES").toISOString()).toBe("2026-07-01T10:00:00.000Z");
    expect(localToUtc("2026-12-01", "12:00", "ES").toISOString()).toBe("2026-12-01T11:00:00.000Z");
  });
});

describe("connections", () => {
  it("connects a single Page and its Instagram account at once, with tokens encrypted", async () => {
    const { brandId } = await plannedBrand();
    expect(await saveConnections(db, tenantId, brandId, [PAGE])).toEqual({ pages: 1, active: true });
    const list = await listConnections(db, tenantId, brandId);
    expect(list.map((c) => [c.channel, c.name, c.status])).toEqual([
      ["facebook", "La Brasa", "active"],
      ["instagram", "@labrasa", "active"],
    ]);
    const rows = await db.select().from(connections).where(eq(connections.brandId, brandId));
    expect(rows.every((row) => !row.encryptedTokens.includes("page-token-1"))).toBe(true);
    expect(await listConnections(db, otherTenantId, brandId)).toEqual([]);
  });

  it("asks which Page to use when there are several", async () => {
    const { brandId } = await plannedBrand();
    const second = { id: "page-2", name: "Otra página", accessToken: "t2", instagram: null };
    expect(await saveConnections(db, tenantId, brandId, [PAGE, second])).toEqual({ pages: 2, active: false });
    let list = await listConnections(db, tenantId, brandId);
    expect(list.every((c) => c.status === "available")).toBe(true);
    const page = list.find((c) => c.name === "La Brasa")!;
    expect(await chooseFacebookPage(db, tenantId, brandId, page.id)).toBe(true);
    list = await listConnections(db, tenantId, brandId);
    expect(list.filter((c) => c.status === "active").map((c) => c.name).sort()).toEqual(["@labrasa", "La Brasa"]);
  });
});

describe("scheduling and publishing", () => {
  it("schedules approved posts when connected, and leaves Instagram posts without a photo for the owner", async () => {
    const { brandId, week } = await plannedBrand();
    await saveConnections(db, tenantId, brandId, [PAGE]);
    const [igPost, igStory, fbPost] = week.items;
    expect(await approve(igPost.item.id, igPost.draft!)).toEqual({ ok: true, scheduled: true });
    expect(await approve(igStory.item.id, igStory.draft!)).toEqual({ ok: true, scheduled: false });
    expect(await approve(fbPost.item.id, fbPost.draft!)).toEqual({ ok: true, scheduled: true });

    const [row] = await db.select().from(contentItems).where(eq(contentItems.id, igPost.item.id));
    expect(row.status).toBe("scheduled");
    expect(row.scheduledAt?.toISOString()).toBe(localToUtc(igPost.brief.date, "12:30", "MX").toISOString());
  });

  it("approves without scheduling when nothing is connected", async () => {
    const { week } = await plannedBrand();
    const [igPost] = week.items;
    expect(await approve(igPost.item.id, igPost.draft!)).toEqual({ ok: true, scheduled: false });
  });

  it("publishes what is due, once, and records it", async () => {
    const { brandId, week } = await plannedBrand();
    await saveConnections(db, tenantId, brandId, [PAGE]);
    const [igPost, , fbPost] = week.items;
    await approve(igPost.item.id, igPost.draft!);
    await approve(fbPost.item.id, fbPost.draft!);

    // Before Tuesday 12:30 nothing is due.
    const { graph, calls } = fakeGraph();
    const early = new Date(localToUtc(igPost.brief.date, "12:00", "MX"));
    await publishDue(deps(graph, early));
    expect(calls.filter((c) => c.account === "ig-1")).toHaveLength(0);

    // "Publicar ahora", with two scheduler runs racing.
    expect(await publishNow(db, tenantId, igPost.item.id)).toBe(true);
    await Promise.all([publishDue(deps(graph)), publishDue(deps(graph))]);
    const igCalls = calls.filter((c) => c.account === "ig-1");
    expect(igCalls).toHaveLength(1);
    expect(igCalls[0].token).toBe("page-token-1");
    expect(igCalls[0].input).toEqual({
      imageUrl: `https://app.example/api/media/${igPost.draft!.assetIds[0]}?f=feed`,
      caption: igPost.draft!.copy,
      story: false,
    });

    const [row] = await db.select().from(contentItems).where(eq(contentItems.id, igPost.item.id));
    expect(row.status).toBe("published");
    const [record] = await db.select().from(publications).where(eq(publications.contentItemId, igPost.item.id));
    expect(record.permalink).toMatch(/^https:\/\/instagram\.com\/p\//);
    expect(record.error).toBeNull();

    // Published posts cannot be edited.
    expect(await saveItem(db, tenantId, igPost.item.id, { copy: "x", assetId: null, decision: "approve" })).toEqual({
      ok: false,
      error: "not_editable",
    });
  });

  it("hands a failed post back to the owner and marks an expired token", async () => {
    const { brandId, week } = await plannedBrand();
    await saveConnections(db, tenantId, brandId, [PAGE]);
    const [igPost] = week.items;
    await approve(igPost.item.id, igPost.draft!);
    await publishNow(db, tenantId, igPost.item.id);
    const { graph } = fakeGraph(() => new MetaApiError("Session expired", 400, 190));
    const [result] = await publishDue(deps(graph));
    expect(result).toEqual({ itemId: igPost.item.id, ok: false, error: "reconnect" });

    const [row] = await db.select().from(contentItems).where(eq(contentItems.id, igPost.item.id));
    expect([row.status, row.scheduledAt]).toEqual(["approved", null]);
    const [record] = await db.select().from(publications).where(eq(publications.contentItemId, igPost.item.id));
    expect(record.error).toBe("reconnect");
    const list = await listConnections(db, tenantId, brandId);
    expect(list.find((c) => c.channel === "instagram")?.status).toBe("expired");
  });

  it("never re-sends a post stuck mid-publish; it asks the owner instead", async () => {
    const { brandId, week } = await plannedBrand();
    await saveConnections(db, tenantId, brandId, [PAGE]);
    const [igPost] = week.items;
    await db
      .update(contentItems)
      .set({ status: "publishing", scheduledAt: new Date(Date.now() - 60 * 60_000) })
      .where(eq(contentItems.id, igPost.item.id));
    const { graph, calls } = fakeGraph();
    await publishDue(deps(graph));
    expect(calls.filter((c) => c.account === "ig-1")).toHaveLength(0);
    const [row] = await db.select().from(contentItems).where(eq(contentItems.id, igPost.item.id));
    expect(row.status).toBe("approved");
    const [record] = await db.select().from(publications).where(eq(publications.contentItemId, igPost.item.id));
    expect(record.error).toBe("unknown_state");
  });

  it("disconnecting wipes tokens and unschedules pending posts", async () => {
    const { brandId, week } = await plannedBrand();
    await saveConnections(db, tenantId, brandId, [PAGE]);
    const [igPost] = week.items;
    await approve(igPost.item.id, igPost.draft!);
    await disconnectMeta(db, tenantId, brandId);
    const rows = await db.select().from(connections).where(eq(connections.brandId, brandId));
    expect(rows.every((r) => r.encryptedTokens === "" && r.status === "disconnected")).toBe(true);
    const [row] = await db.select().from(contentItems).where(eq(contentItems.id, igPost.item.id));
    expect([row.status, row.scheduledAt]).toEqual(["approved", null]);
    expect(await listConnections(db, tenantId, brandId)).toEqual([]);
  });
});
