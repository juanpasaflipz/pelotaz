import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildAuthEmail, minutesLeft, UnusableEvent, type NeonAuthEvent } from "@/lib/email/auth-emails";
import { EmailNotSent, FROM, sendEmail } from "@/lib/email/resend";
import { clearKeyCache, MAX_AGE_MS, verifyNeonWebhook, WebhookError, type JwksLoader } from "@/lib/auth/webhook";

// A signing key standing in for Neon's, and the JWKS it would publish.
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const KID = "test-key-1";
const jwks: JwksLoader = async () => ({ keys: [{ ...publicKey.export({ format: "jwk" }), kid: KID }] });

/** Signs a body the way Neon does: a detached Ed25519 JWS over the timestamp and the base64url body. */
function signed(body: string, timestamp = Date.now(), kid = KID) {
  const header = Buffer.from(JSON.stringify({ alg: "EdDSA", typ: "JWS", kid })).toString("base64url");
  const payload = Buffer.from(`${timestamp}.${Buffer.from(body, "utf8").toString("base64url")}`).toString("base64url");
  const signature = sign(null, Buffer.from(`${header}.${payload}`), privateKey).toString("base64url");
  return new Headers({
    "x-neon-signature": `${header}..${signature}`,
    "x-neon-signature-kid": kid,
    "x-neon-timestamp": String(timestamp),
  });
}

const otpEvent = (over: Partial<NeonAuthEvent["event_data"]> = {}): NeonAuthEvent => ({
  event_id: "evt_1",
  event_type: "send.otp",
  timestamp: "2026-11-16T15:00:00.000Z",
  user: { email: "ana@taqueria.mx" },
  event_data: { otp_code: "482913", otp_type: "email-verification", expires_at: "2026-11-16T15:05:00.000Z", ...over },
});

beforeEach(() => clearKeyCache());

describe("verifying Neon's webhook", () => {
  const body = JSON.stringify(otpEvent());

  it("accepts a delivery Neon signed", async () => {
    await expect(verifyNeonWebhook(body, signed(body), { loadJwks: jwks })).resolves.toMatchObject({ event_id: "evt_1" });
  });

  it("refuses a body changed after signing", async () => {
    const headers = signed(body);
    const tampered = body.replace("482913", "000000");
    await expect(verifyNeonWebhook(tampered, headers, { loadJwks: jwks })).rejects.toThrow("Invalid signature");
  });

  it("refuses a delivery signed by another key", async () => {
    const other = generateKeyPairSync("ed25519");
    const otherJwks: JwksLoader = async () => ({ keys: [{ ...other.publicKey.export({ format: "jwk" }), kid: KID }] });
    await expect(verifyNeonWebhook(body, signed(body), { loadJwks: otherJwks })).rejects.toBeInstanceOf(WebhookError);
  });

  it("refuses an unknown key id, missing headers and old deliveries", async () => {
    await expect(verifyNeonWebhook(body, signed(body, Date.now(), "nope"), { loadJwks: jwks })).rejects.toThrow(
      "Unknown signing key",
    );
    await expect(verifyNeonWebhook(body, new Headers(), { loadJwks: jwks })).rejects.toThrow("Missing signature headers");
    const old = Date.now() - MAX_AGE_MS - 1_000;
    await expect(verifyNeonWebhook(body, signed(body, old), { loadJwks: jwks })).rejects.toThrow("Stale");
  });

  it("refuses a signature that is not detached", async () => {
    const headers = signed(body);
    headers.set("x-neon-signature", headers.get("x-neon-signature")!.replace("..", ".abc."));
    await expect(verifyNeonWebhook(body, headers, { loadJwks: jwks })).rejects.toThrow("detached");
  });
});

describe("the Spanish emails", () => {
  it("puts the code in the subject and the body, with the time left", () => {
    const email = buildAuthEmail(otpEvent());
    expect(email.to).toBe("ana@taqueria.mx");
    expect(email.subject).toBe("482913 es tu código para confirmar tu correo");
    expect(email.html).toContain("482913");
    expect(email.html).toContain("Vence en 5 minutos.");
    expect(email.text).toContain("482913");
    expect(email.idempotencyKey).toBe("evt_1");
  });

  it("has wording for each kind of code", () => {
    expect(buildAuthEmail(otpEvent({ otp_type: "sign-in" })).subject).toContain("para entrar a Pelotaz");
    expect(buildAuthEmail(otpEvent({ otp_type: "forget-password" })).subject).toContain("cambiar tu contraseña");
  });

  it("sends password-reset links as a button and a plain address", () => {
    const email = buildAuthEmail({
      event_id: "evt_2",
      event_type: "send.magic_link",
      user: { email: "ana@taqueria.mx" },
      event_data: { link_type: "forget-password", link_url: "https://auth.example/reset?token=a&b=<x>" },
    });
    expect(email.subject).toBe("Cambia tu contraseña de Pelotaz");
    expect(email.html).toContain("Cambiar mi contraseña");
    // Escaped in the markup, intact in the text version.
    expect(email.html).toContain("token=a&amp;b=&lt;x&gt;");
    expect(email.html).not.toContain("<x>");
    expect(email.text).toContain("https://auth.example/reset?token=a&b=<x>");
  });

  it("refuses events it cannot turn into a safe email", () => {
    expect(() => buildAuthEmail(otpEvent({ otp_type: "something-else" }))).toThrow(UnusableEvent);
    expect(() => buildAuthEmail(otpEvent({ otp_code: "<script>" }))).toThrow(UnusableEvent);
    expect(() => buildAuthEmail({ ...otpEvent(), user: {} })).toThrow(UnusableEvent);
    expect(() =>
      buildAuthEmail({
        event_id: "e",
        event_type: "send.magic_link",
        user: { email: "a@b.mx" },
        event_data: { link_type: "sign-in", link_url: "javascript:alert(1)" },
      }),
    ).toThrow(UnusableEvent);
  });

  it("reads expiry in ISO, seconds or milliseconds, and leaves it out when odd", () => {
    expect(minutesLeft("2026-11-16T15:10:00Z", "2026-11-16T15:00:00Z")).toBe(10);
    expect(minutesLeft(1_794_842_700, 1_794_842_100)).toBe(10);
    expect(minutesLeft(1_794_842_700_000, 1_794_842_100_000)).toBe(10);
    expect(minutesLeft(undefined, 0)).toBeNull();
    expect(minutesLeft("2026-11-16T14:00:00Z", "2026-11-16T15:00:00Z")).toBeNull();
    expect(buildAuthEmail(otpEvent({ expires_at: undefined })).html).not.toContain("Vence");
  });
});

describe("sending through Resend", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends from pelotaz.com with the key and an idempotency key", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "re_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(sendEmail(buildAuthEmail(otpEvent()), "re_test")).resolves.toEqual({ id: "re_1" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer re_test");
    expect(headers["idempotency-key"]).toBe("evt_1");
    expect(JSON.parse(init.body as string)).toMatchObject({ from: FROM, to: ["ana@taqueria.mx"] });
  });

  it("marks rate limits and outages as worth retrying, and bad requests not", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("slow down", { status: 429 })));
    await expect(sendEmail(buildAuthEmail(otpEvent()), "k")).rejects.toMatchObject({ retryable: true });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad", { status: 422 })));
    await expect(sendEmail(buildAuthEmail(otpEvent()), "k")).rejects.toMatchObject({ retryable: false });
    await expect(sendEmail(buildAuthEmail(otpEvent()), "")).rejects.toBeInstanceOf(EmailNotSent);
  });
});
