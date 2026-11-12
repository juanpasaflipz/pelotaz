import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { brands, jobs, memberships, tenants } from "@/db/schema";
import { withTenant, type Db } from "@/db/tenant";
import { isAllowed, parseAllowlist, resolveAccess, type Identity } from "@/lib/auth/access";
import { classifyAuthError, isOperatorProblem } from "@/lib/auth/errors";
import { checkBrandLimit, claimOnboardingRun } from "@/lib/limits";
import { createTenant, createTestDb } from "./helpers/db";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(async () => {
  await close();
});

const person = (over: Partial<Identity> = {}): Identity => ({
  userId: `user_${Math.random().toString(36).slice(2)}`,
  email: "ana@taqueria.mx",
  emailVerified: true,
  name: "Ana",
  ...over,
});
const open = { allowlist: [], allowUnverified: false };

describe("allowlist", () => {
  it("reads addresses and domains separated by commas, spaces or new lines", () => {
    expect(parseAllowlist(" Ana@Taqueria.mx, @juanbertos.com\n luis@x.mx ")).toEqual([
      "ana@taqueria.mx",
      "@juanbertos.com",
      "luis@x.mx",
    ]);
    expect(parseAllowlist(undefined)).toEqual([]);
  });

  it("lets everyone in when empty", () => {
    expect(isAllowed("quien@sea.mx", [])).toBe(true);
  });

  it("matches full addresses and whole domains, ignoring case", () => {
    const list = parseAllowlist("ana@taqueria.mx,@juanbertos.com");
    expect(isAllowed("ANA@taqueria.mx", list)).toBe(true);
    expect(isAllowed("cocina@juanbertos.com", list)).toBe(true);
    expect(isAllowed("otra@taqueria.mx", list)).toBe(false);
  });

  it("does not let a lookalike domain through", () => {
    const list = parseAllowlist("@juanbertos.com");
    expect(isAllowed("x@juanbertos.com.evil.mx", list)).toBe(false);
    expect(isAllowed("x@notjuanbertos.com", list)).toBe(false);
    expect(isAllowed("juanbertos.com@evil.mx", list)).toBe(false);
  });
});

describe("auth error messages", () => {
  // Codes as the Neon Auth SDK reports them: lowercase, rewritten from the provider's.
  it("blames the credentials only when the provider does", () => {
    expect(classifyAuthError("sign-in", { code: "invalid_credentials", status: 401 })).toBe("bad_credentials");
    expect(classifyAuthError("sign-in", { code: "user_not_found", status: 404 })).toBe("bad_credentials");
    expect(classifyAuthError("sign-in", { status: 401 })).toBe("bad_credentials");
  });

  it("treats a too-short password at sign-in as a wrong password", () => {
    // Seen on the live site: sign-in answered { code: "weak_password", status: 400 }.
    expect(classifyAuthError("sign-in", { code: "weak_password", status: 400 })).toBe("bad_credentials");
    expect(classifyAuthError("sign-up", { code: "weak_password", status: 400 })).toBe("weak_password");
  });

  it("reports an untrusted site domain as our problem, on both forms", () => {
    // The SDK has no code for this; it shows up as a generic 403 with the reason in the message.
    for (const action of ["sign-in", "sign-up"] as const) {
      const kind = classifyAuthError(action, { code: "feature_not_supported", status: 403, message: "Invalid origin" });
      expect(kind).toBe("domain_not_trusted");
      expect(isOperatorProblem(kind)).toBe(true);
    }
    expect(classifyAuthError("sign-up", { code: "INVALID_ORIGIN", status: 403 })).toBe("domain_not_trusted");
    expect(classifyAuthError("sign-up", { code: "validation_failed", status: 400, message: "Missing origin" })).toBe("domain_not_trusted");
  });

  it("does not call an outage a wrong password", () => {
    expect(classifyAuthError("sign-in", { code: "internal_error", status: 500 })).toBe("unavailable");
    expect(classifyAuthError("sign-in", { code: "feature_not_supported", status: 403, message: "Forbidden" })).toBe("unavailable");
    expect(classifyAuthError("sign-in", {})).toBe("unavailable");
    expect(classifyAuthError("sign-up", { status: 503 })).toBe("unavailable");
  });

  it("tells an unconfirmed account to confirm, and an existing one to sign in", () => {
    expect(classifyAuthError("sign-in", { code: "email_not_confirmed", status: 403 })).toBe("email_not_verified");
    expect(classifyAuthError("sign-up", { code: "user_already_exists", status: 422 })).toBe("sign_up_failed");
    expect(classifyAuthError("sign-up", { code: "email_address_invalid", status: 400 })).toBe("invalid_email");
  });

  it("accepts the provider's original spelling too", () => {
    expect(classifyAuthError("sign-in", { code: "INVALID_EMAIL_OR_PASSWORD", status: 401 })).toBe("bad_credentials");
    expect(classifyAuthError("sign-in", { code: "EMAIL_NOT_VERIFIED", status: 403 })).toBe("email_not_verified");
    expect(classifyAuthError("sign-up", { code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL", status: 422 })).toBe("sign_up_failed");
  });

  it("recognises rate limiting", () => {
    expect(classifyAuthError("sign-in", { code: "over_request_rate_limit", status: 429 })).toBe("rate_limited");
  });

  it("keeps user mistakes out of the error log", () => {
    expect(isOperatorProblem("bad_credentials")).toBe(false);
    expect(isOperatorProblem("sign_up_failed")).toBe(false);
    expect(isOperatorProblem("rate_limited")).toBe(false);
  });
});

describe("resolveAccess", () => {
  it("creates a workspace on the first visit and reuses it afterwards", async () => {
    const ana = person();
    const first = await resolveAccess(db, ana, open);
    const second = await resolveAccess(db, ana, open);
    expect(first.kind).toBe("ok");
    expect(second).toEqual(first);
    const rows = await db.select().from(memberships).where(eq(memberships.userId, ana.userId));
    expect(rows.map((r) => r.role)).toEqual(["owner"]);
  });

  it("creates one workspace when the first visits arrive together", async () => {
    const luis = person({ email: "luis@x.mx" });
    const results = await Promise.all(Array.from({ length: 6 }, () => resolveAccess(db, luis, open)));
    const tenantIds = new Set(results.map((r) => (r.kind === "ok" ? r.tenantId : r.kind)));
    expect(tenantIds.size).toBe(1);
    const rows = await db.select().from(memberships).where(eq(memberships.userId, luis.userId));
    expect(rows.length).toBe(1);
  });

  it("gives different people different workspaces", async () => {
    const a = await resolveAccess(db, person({ email: "a@x.mx" }), open);
    const b = await resolveAccess(db, person({ email: "b@x.mx" }), open);
    expect(a.kind === "ok" && b.kind === "ok" && a.tenantId !== b.tenantId).toBe(true);
  });

  it("names the workspace after the person, or their address when they gave no name", async () => {
    const named = await resolveAccess(db, person({ name: "Taquería La Brasa" }), open);
    const unnamed = await resolveAccess(db, person({ name: null, email: "Sin.Nombre@x.mx" }), open);
    const nameOf = async (access: typeof named) => {
      if (access.kind !== "ok") throw new Error("expected access");
      const [row] = await db.select().from(tenants).where(eq(tenants.id, access.tenantId));
      return row.name;
    };
    expect(await nameOf(named)).toBe("Taquería La Brasa");
    expect(await nameOf(unnamed)).toBe("sin.nombre@x.mx");
  });

  it("holds an unverified address at the door and creates nothing", async () => {
    const stranger = person({ emailVerified: false });
    expect(await resolveAccess(db, stranger, open)).toEqual({ kind: "unverified", email: "ana@taqueria.mx" });
    const rows = await db.select().from(memberships).where(eq(memberships.userId, stranger.userId));
    expect(rows).toEqual([]);
  });

  it("does not let someone claim an invited address they have not confirmed", async () => {
    const impostor = person({ email: "ana@taqueria.mx", emailVerified: false });
    const policy = { allowlist: ["ana@taqueria.mx"], allowUnverified: false };
    expect((await resolveAccess(db, impostor, policy)).kind).toBe("unverified");
  });

  it("turns away a confirmed address that is not on the list", async () => {
    const outsider = person({ email: "otro@fuera.mx" });
    const policy = { allowlist: ["@taqueria.mx"], allowUnverified: false };
    expect(await resolveAccess(db, outsider, policy)).toEqual({ kind: "not_invited", email: "otro@fuera.mx" });
    const rows = await db.select().from(memberships).where(eq(memberships.userId, outsider.userId));
    expect(rows).toEqual([]);
  });

  it("can admit unverified addresses when explicitly told to, for local development", async () => {
    const dev = person({ emailVerified: false, email: "dev@x.mx" });
    expect((await resolveAccess(db, dev, { allowlist: [], allowUnverified: true })).kind).toBe("ok");
  });
});

describe("limits", () => {
  const limits = { maxBrands: 2, onboardingsPerDay: 3 };
  const addBrand = (tenantId: string, name: string) =>
    withTenant(db, tenantId, async (tx) => {
      const [row] = await tx
        .insert(brands)
        .values({ tenantId, name, sourceUrl: "https://x.example" })
        .returning();
      return row.id;
    });

  it("allows brands up to the ceiling and refuses the next", async () => {
    const tenantId = await createTenant(db, "Limites");
    const check = () => withTenant(db, tenantId, (tx) => checkBrandLimit(tx, tenantId, limits));
    expect(await check()).toBeNull();
    await addBrand(tenantId, "uno");
    expect(await check()).toBeNull();
    await addBrand(tenantId, "dos");
    expect(await check()).toBe("brand_limit");
  });

  it("counts each tenant on its own", async () => {
    const busy = await createTenant(db, "Ocupado");
    const fresh = await createTenant(db, "Nuevo");
    await addBrand(busy, "uno");
    await addBrand(busy, "dos");
    expect(await withTenant(db, fresh, (tx) => checkBrandLimit(tx, fresh, limits))).toBeNull();
  });

  it("allows onboarding runs up to the daily ceiling and refuses the next", async () => {
    const tenantId = await createTenant(db, "Diario");
    const brandId = await addBrand(tenantId, "uno");
    const claim = () => withTenant(db, tenantId, (tx) => claimOnboardingRun(tx, tenantId, brandId, limits));
    expect([await claim(), await claim(), await claim()]).toEqual([null, null, null]);
    expect(await claim()).toBe("daily_limit");
    const logged = await db.select().from(jobs).where(eq(jobs.tenantId, tenantId));
    expect(logged.length).toBe(3);
  });

  it("does not let simultaneous requests slip past the daily ceiling", async () => {
    const tenantId = await createTenant(db, "Simultáneo");
    const brandId = await addBrand(tenantId, "uno");
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        withTenant(db, tenantId, (tx) => claimOnboardingRun(tx, tenantId, brandId, limits)),
      ),
    );
    expect(results.filter((r) => r === null).length).toBe(3);
    expect(results.filter((r) => r === "daily_limit").length).toBe(5);
  });

  it("forgets runs older than a day", async () => {
    const tenantId = await createTenant(db, "Ayer");
    const brandId = await addBrand(tenantId, "uno");
    const claim = () => withTenant(db, tenantId, (tx) => claimOnboardingRun(tx, tenantId, brandId, limits));
    await claim();
    await claim();
    await claim();
    await db
      .update(jobs)
      .set({ createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) })
      .where(eq(jobs.tenantId, tenantId));
    expect(await claim()).toBeNull();
  });

  it("leaves no trace when the surrounding change is rolled back", async () => {
    const tenantId = await createTenant(db, "Reversa");
    const brandId = await addBrand(tenantId, "uno");
    await withTenant(db, tenantId, async (tx) => {
      await claimOnboardingRun(tx, tenantId, brandId, limits);
      throw new Error("something else failed");
    }).catch(() => {});
    const logged = await db.select().from(jobs).where(eq(jobs.tenantId, tenantId));
    expect(logged).toEqual([]);
  });
});
