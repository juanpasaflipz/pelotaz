import { createPublicKey, verify, type JsonWebKey, type KeyObject } from "node:crypto";

/**
 * Verifies a webhook from Neon Auth (managed Better Auth).
 *
 * Neon signs each delivery with Ed25519 as a detached JWS: the
 * `x-neon-signature` header is `header..signature`, and the signed content is
 * `header + "." + base64url(timestamp + "." + base64url(rawBody))`. The public
 * keys are published at `${NEON_AUTH_BASE_URL}/.well-known/jwks.json`; the
 * `x-neon-signature-kid` header names the one used. There is no shared secret.
 *
 * See https://neon.com/docs/auth/guides/webhooks.
 */

export class WebhookError extends Error {
  constructor(
    message: string,
    /** 401 for anything that failed the signature or freshness check; 503 when the keys could not be loaded. */
    readonly status: 401 | 503,
  ) {
    super(message);
  }
}

/** Deliveries older than this are refused, so a captured request cannot be replayed later. */
export const MAX_AGE_MS = 5 * 60 * 1000;

interface Jwk extends JsonWebKey {
  kid?: string;
}

export type JwksLoader = () => Promise<{ keys: Jwk[] }>;

const keyCache = new Map<string, KeyObject>();

/** Loads Neon's published keys. Keys are cached by id; an unknown id reloads them once. */
export function neonJwksLoader(baseUrl = process.env.NEON_AUTH_BASE_URL): JwksLoader {
  return async () => {
    if (!baseUrl) throw new WebhookError("NEON_AUTH_BASE_URL is not set", 503);
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/.well-known/jwks.json`, {
      signal: AbortSignal.timeout(3_000),
    }).catch((error: unknown) => {
      throw new WebhookError(`Could not load Neon's keys: ${String(error).slice(0, 120)}`, 503);
    });
    if (!response.ok) throw new WebhookError(`Neon's keys answered ${response.status}`, 503);
    return (await response.json()) as { keys: Jwk[] };
  };
}

async function publicKeyFor(kid: string, loadJwks: JwksLoader): Promise<KeyObject> {
  const cached = keyCache.get(kid);
  if (cached) return cached;
  const { keys } = await loadJwks();
  for (const jwk of keys) {
    if (jwk.kid) keyCache.set(jwk.kid, createPublicKey({ key: jwk, format: "jwk" }));
  }
  const key = keyCache.get(kid);
  if (!key) throw new WebhookError("Unknown signing key", 401);
  return key;
}

/** Only for tests: forget the cached keys. */
export function clearKeyCache(): void {
  keyCache.clear();
}

/**
 * Checks the signature and age of a delivery and returns the parsed body.
 * `rawBody` must be the body exactly as received, never re-serialized JSON.
 */
export async function verifyNeonWebhook(
  rawBody: string,
  headers: Headers,
  options: { loadJwks?: JwksLoader; now?: number } = {},
): Promise<unknown> {
  const signature = headers.get("x-neon-signature");
  const kid = headers.get("x-neon-signature-kid");
  const timestamp = headers.get("x-neon-timestamp");
  if (!signature || !kid || !timestamp) throw new WebhookError("Missing signature headers", 401);

  const sentAt = Number(timestamp);
  const age = (options.now ?? Date.now()) - sentAt;
  // A little room for clock skew in the other direction.
  if (!Number.isFinite(sentAt) || age > MAX_AGE_MS || age < -60_000) {
    throw new WebhookError("Stale or invalid timestamp", 401);
  }

  const [header, emptyPayload, signed] = signature.split(".");
  if (!header || emptyPayload !== "" || !signed) throw new WebhookError("Expected a detached JWS", 401);

  const key = await publicKeyFor(kid, options.loadJwks ?? neonJwksLoader());
  const payload = Buffer.from(`${timestamp}.${Buffer.from(rawBody, "utf8").toString("base64url")}`, "utf8").toString(
    "base64url",
  );
  const valid = verify(null, Buffer.from(`${header}.${payload}`), key, Buffer.from(signed, "base64url"));
  if (!valid) throw new WebhookError("Invalid signature", 401);

  try {
    return JSON.parse(rawBody);
  } catch {
    throw new WebhookError("Body is not JSON", 401);
  }
}
