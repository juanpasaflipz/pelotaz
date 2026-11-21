import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { accessRequests } from "@/db/schema";
import { withTenant, type Db } from "@/db/tenant";
import {
  countPendingAccessRequests,
  decideAccessRequest,
  isAdmin,
  listAccessRequests,
  parseAdmins,
  submitAccessRequest,
} from "@/lib/access-requests";
import { isInvited, resolveAccess, type Identity } from "@/lib/auth/access";
import { createTenant, createTestDb } from "./helpers/db";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(async () => {
  await close();
});

const ask = (email: string, over: Partial<{ businessName: string; website: string }> = {}) =>
  submitAccessRequest(db, { email, businessName: "Tacos Ana", website: "tacosana.mx", ...over });

const rowFor = async (email: string) => {
  const [row] = await db.select().from(accessRequests).where(eq(accessRequests.email, email));
  return row;
};

const person = (email: string, over: Partial<Identity> = {}): Identity => ({
  userId: `user_${Math.random().toString(36).slice(2)}`,
  email,
  emailVerified: true,
  name: null,
  ...over,
});
// A pilot that is closed to everyone but the operator.
const closed = { allowlist: ["juan@pelotaz.test"], allowUnverified: false };

describe("asking for access", () => {
  it("saves a request as pending, with the address lowercased and the site normalised", async () => {
    const result = await ask("  Ana@Taqueria.MX ");
    expect(result).toEqual({ ok: true, email: "ana@taqueria.mx", created: true, approved: false });
    const row = await rowFor("ana@taqueria.mx");
    expect(row).toMatchObject({ status: "pending", businessName: "Tacos Ana", website: "https://tacosana.mx/" });
  });

  it("gives a repeated address the same answer and keeps one row", async () => {
    await ask("dos@veces.mx");
    const again = await ask("DOS@veces.mx", { businessName: "Dos Veces", website: "dosveces.mx" });
    expect(again).toMatchObject({ ok: true, created: false });
    const rows = await db.select().from(accessRequests).where(eq(accessRequests.email, "dos@veces.mx"));
    expect(rows).toHaveLength(1);
    // Still waiting, so the newer details replace the older ones.
    expect(rows[0]).toMatchObject({ businessName: "Dos Veces", website: "https://dosveces.mx/" });
  });

  it("does not let a repeated request undo a decision or change its details", async () => {
    await ask("no@gracias.mx");
    const row = await rowFor("no@gracias.mx");
    await decideAccessRequest(db, row.id, "rejected", "juan@pelotaz.test");
    const again = await ask("no@gracias.mx", { businessName: "Otro nombre" });
    expect(again).toMatchObject({ ok: true, created: false });
    expect(await rowFor("no@gracias.mx")).toMatchObject({ status: "rejected", businessName: "Tacos Ana" });
  });

  it("refuses what it cannot use, and saves nothing", async () => {
    expect(await ask("no-es-correo")).toEqual({ ok: false, error: "invalid_email" });
    expect(await ask("a@b.mx", { businessName: "   " })).toEqual({ ok: false, error: "missing_business" });
    expect(await ask("a@b.mx", { website: "no es una dirección" })).toEqual({ ok: false, error: "invalid_url" });
    // The crawler would refuse these, so the form does too.
    expect(await ask("a@b.mx", { website: "http://localhost" })).toEqual({ ok: false, error: "private_url" });
    expect(await ask("a@b.mx", { website: "http://169.254.169.254/latest" })).toEqual({ ok: false, error: "private_url" });
    expect(await rowFor("a@b.mx")).toBeUndefined();
  });

  it("stops taking new addresses at the daily ceiling, but still answers known ones", async () => {
    const fresh = await createTestDb();
    try {
      const submit = (email: string) =>
        submitAccessRequest(fresh.db, { email, businessName: "N", website: "n.mx" }, { perDay: 2 });
      expect((await submit("uno@n.mx")).ok).toBe(true);
      expect((await submit("dos@n.mx")).ok).toBe(true);
      expect(await submit("tres@n.mx")).toEqual({ ok: false, error: "busy" });
      expect(await submit("uno@n.mx")).toMatchObject({ ok: true, created: false });
      // Requests older than a day do not count.
      await fresh.db.execute(sql`update access_requests set created_at = now() - interval '25 hours'`);
      expect((await submit("tres@n.mx")).ok).toBe(true);
    } finally {
      await fresh.close();
    }
  });

  it("holds the ceiling when requests arrive together", async () => {
    const fresh = await createTestDb();
    try {
      const results = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          submitAccessRequest(fresh.db, { email: `p${i}@n.mx`, businessName: "N", website: "n.mx" }, { perDay: 3 }),
        ),
      );
      expect(results.filter((r) => r.ok)).toHaveLength(3);
      expect(await countPendingAccessRequests(fresh.db)).toBe(3);
    } finally {
      await fresh.close();
    }
  });
});

describe("interest in a paid plan", () => {
  it("records the plan and billing option from a plan's button", async () => {
    await submitAccessRequest(db, {
      email: "pro@taqueria.mx",
      businessName: "Tacos Pro",
      website: "tacospro.mx",
      planInterest: "pro",
      billingInterest: "mensual",
    });
    expect(await rowFor("pro@taqueria.mx")).toMatchObject({ planInterest: "pro", billingInterest: "mensual" });
  });

  it("ignores values that are not a plan or a billing option", async () => {
    await submitAccessRequest(db, {
      email: "raro@taqueria.mx",
      businessName: "Tacos Raros",
      website: "tacosraros.mx",
      planInterest: "enterprise",
      billingInterest: "semanal",
    });
    expect(await rowFor("raro@taqueria.mx")).toMatchObject({ planInterest: null, billingInterest: null });
  });

  it("keeps the latest interest without changing a decision", async () => {
    const [row] = await db
      .insert(accessRequests)
      .values({ email: "decidida@taqueria.mx", businessName: "Tacos D", website: "https://d.mx/", status: "approved" })
      .returning();
    await submitAccessRequest(db, {
      email: "decidida@taqueria.mx",
      businessName: "Otro nombre",
      website: "otro.mx",
      planInterest: "starter",
      billingInterest: "anual",
    });
    expect(await rowFor("decidida@taqueria.mx")).toMatchObject({
      id: row.id,
      status: "approved",
      businessName: "Tacos D",
      planInterest: "starter",
      billingInterest: "anual",
    });
  });

  it("a plain request does not erase an earlier interest", async () => {
    await ask("pro@taqueria.mx");
    expect(await rowFor("pro@taqueria.mx")).toMatchObject({ planInterest: "pro", billingInterest: "mensual" });
  });
});

describe("where a request came from", () => {
  it("records the short address and the standard utm parameters", async () => {
    await submitAccessRequest(db, {
      email: "grupo@taqueria.mx",
      businessName: "Tacos Grupo",
      website: "tacosgrupo.mx",
      source: "beta",
      utm: { utm_source: "whatsapp", utm_campaign: " grupo-500 ", fbclid: "x", utm_medium: 3 },
    });
    expect(await rowFor("grupo@taqueria.mx")).toMatchObject({
      source: "beta",
      utm: { utm_source: "whatsapp", utm_campaign: "grupo-500" },
    });
  });

  it("keeps the first origin when the same person asks again from elsewhere", async () => {
    await submitAccessRequest(db, {
      email: "grupo@taqueria.mx",
      businessName: "Tacos Grupo",
      website: "tacosgrupo.mx",
      source: "empieza",
      utm: { utm_source: "facebook" },
    });
    expect(await rowFor("grupo@taqueria.mx")).toMatchObject({ source: "beta", utm: { utm_source: "whatsapp" } });
  });

  it("fills an empty origin on a later request", async () => {
    await ask("tarde@taqueria.mx");
    await submitAccessRequest(db, { email: "tarde@taqueria.mx", businessName: "T", website: "t.mx", source: "beta" });
    expect(await rowFor("tarde@taqueria.mx")).toMatchObject({ source: "beta", utm: null });
  });

  it("ignores unknown sources", async () => {
    await submitAccessRequest(db, { email: "otro@taqueria.mx", businessName: "O", website: "o.mx", source: "admin" });
    expect(await rowFor("otro@taqueria.mx")).toMatchObject({ source: null });
  });
});

describe("approval decides who gets a workspace", () => {
  it("keeps a pending address out and lets an approved one in", async () => {
    await ask("luz@panaderia.mx");
    expect(await resolveAccess(db, person("luz@panaderia.mx"), closed)).toEqual({
      kind: "not_invited",
      email: "luz@panaderia.mx",
    });

    const row = await rowFor("luz@panaderia.mx");
    const decided = await decideAccessRequest(db, row.id, "approved", "juan@pelotaz.test");
    expect(decided).toMatchObject({ status: "approved", decidedBy: "juan@pelotaz.test" });
    expect(decided?.decidedAt).toBeInstanceOf(Date);

    const access = await resolveAccess(db, person("LUZ@panaderia.mx"), closed);
    expect(access.kind).toBe("ok");
  });

  it("still asks an approved address to confirm it first", async () => {
    await ask("sin@confirmar.mx");
    await decideAccessRequest(db, (await rowFor("sin@confirmar.mx")).id, "approved", "juan@pelotaz.test");
    // Otherwise anyone could register an approved person's address and take their place.
    expect(await resolveAccess(db, person("sin@confirmar.mx", { emailVerified: false }), closed)).toEqual({
      kind: "unverified",
      email: "sin@confirmar.mx",
    });
  });

  it("takes access away again when an approval is withdrawn", async () => {
    await ask("ida@vuelta.mx");
    const { id } = await rowFor("ida@vuelta.mx");
    await decideAccessRequest(db, id, "approved", "juan@pelotaz.test");
    const who = person("ida@vuelta.mx");
    expect((await resolveAccess(db, who, closed)).kind).toBe("ok");
    await decideAccessRequest(db, id, "rejected", "juan@pelotaz.test");
    expect((await resolveAccess(db, who, closed)).kind).toBe("not_invited");
  });

  it("does not approve by lookalike: only the exact address", async () => {
    await ask("real@negocio.mx");
    await decideAccessRequest(db, (await rowFor("real@negocio.mx")).id, "approved", "juan@pelotaz.test");
    expect(await isInvited(db, "real@negocio.mx", closed.allowlist)).toBe(true);
    expect(await isInvited(db, "otra@negocio.mx", closed.allowlist)).toBe(false);
    expect(await isInvited(db, "real@negocio.mx.evil.mx", closed.allowlist)).toBe(false);
  });

  it("leaves the allowlist working on its own", async () => {
    expect(await isInvited(db, "juan@pelotaz.test", closed.allowlist)).toBe(true);
    expect(await isInvited(db, "nadie@nunca.mx", [])).toBe(true);
  });

  it("answers null for a request that does not exist", async () => {
    expect(await decideAccessRequest(db, "00000000-0000-4000-8000-000000000000", "approved", "x@y.mx")).toBeNull();
  });

  it("lists by status, newest first", async () => {
    const pending = await listAccessRequests(db, "pending");
    expect(pending.length).toBeGreaterThan(0);
    expect(pending.every((r) => r.status === "pending")).toBe(true);
    const times = pending.map((r) => r.createdAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });
});

describe("the list is not tenant data", () => {
  it("cannot be read or written as a tenant", async () => {
    const tenantId = await createTenant(db, "Curiosa");
    await expect(withTenant(db, tenantId, (tx) => tx.select().from(accessRequests))).rejects.toThrow();
    await expect(
      withTenant(db, tenantId, (tx) =>
        tx.update(accessRequests).set({ status: "approved" }).where(eq(accessRequests.email, "ana@taqueria.mx")),
      ),
    ).rejects.toThrow();
  });
});

describe("admins", () => {
  it("are full addresses only", () => {
    expect(parseAdmins(" Juan@Pelotaz.test, @pelotaz.test\n otra@x.mx ")).toEqual(["juan@pelotaz.test", "otra@x.mx"]);
    expect(parseAdmins(undefined)).toEqual([]);
  });

  it("is nobody when the list is empty", () => {
    expect(isAdmin("juan@pelotaz.test", [])).toBe(false);
    expect(isAdmin("JUAN@pelotaz.test", ["juan@pelotaz.test"])).toBe(true);
    expect(isAdmin("x@pelotaz.test", ["juan@pelotaz.test"])).toBe(false);
  });
});
