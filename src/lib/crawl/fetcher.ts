import type { LookupFunction } from "node:net";
import { Agent, fetch } from "undici";
import type { FetchedResource, PageFetcher, ResourceKind } from "./types";
import { guardedLookup, parsePublicUrl, UnsafeUrlError } from "./url-guard";

export const CRAWLER_USER_AGENT =
  "PelotazBot/0.1 (+https://pelotaz.com/bot; brand onboarding crawler)";

const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 10_000;
const MAX_BYTES: Record<ResourceKind, number> = {
  html: 2_000_000,
  xml: 5_000_000,
  css: 1_000_000,
  text: 200_000,
};

const ACCEPT: Record<ResourceKind, string> = {
  html: "text/html,application/xhtml+xml",
  xml: "application/xml,text/xml,text/plain",
  css: "text/css",
  text: "text/plain",
};

const CONTENT_TYPE_OK: Record<ResourceKind, RegExp> = {
  html: /^(text\/html|application\/xhtml\+xml)/i,
  xml: /^(application|text)\/(xml|plain|x-gzip|rss\+xml)/i,
  css: /^text\/css/i,
  text: /^text\//i,
};

export class FetchRejectedError extends Error {
  constructor(
    public readonly reason:
      | "too_many_redirects"
      | "bad_redirect"
      | "wrong_content_type"
      | "too_large"
      | "timeout"
      | "network",
    detail?: string,
  ) {
    super(detail ? `${reason}: ${detail}` : reason);
    this.name = "FetchRejectedError";
  }
}

export interface GuardedFetcherOptions {
  /**
   * For tests only: lets the suite point a public-looking hostname at a local
   * server on an arbitrary port. Every other check (scheme, credentials,
   * private IP literals, private hostnames, redirect re-validation) stays on.
   */
  testOverrides?: { lookup: LookupFunction; allowAnyPort: boolean };
}

/**
 * The production `PageFetcher`. Redirects are followed by hand so that every
 * hop goes through the same URL checks as the first request, and bodies are
 * read with a byte cap so a hostile server cannot exhaust memory.
 */
export function createGuardedFetcher(options: GuardedFetcherOptions = {}): PageFetcher {
  const overrides = options.testOverrides;
  const dispatcher = new Agent({
    connect: { lookup: overrides?.lookup ?? (guardedLookup as LookupFunction) },
    headersTimeout: TIMEOUT_MS,
    bodyTimeout: TIMEOUT_MS,
  });

  const checkUrl = (raw: string): URL =>
    parsePublicUrl(raw, { allowAnyPort: overrides?.allowAnyPort === true });

  return {
    async fetch(rawUrl: string, kind: ResourceKind): Promise<FetchedResource> {
      let url = checkUrl(rawUrl);
      const signal = AbortSignal.timeout(TIMEOUT_MS * 2);

      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        let response;
        try {
          response = await fetch(url, {
            dispatcher,
            redirect: "manual",
            signal,
            headers: {
              "user-agent": CRAWLER_USER_AGENT,
              accept: ACCEPT[kind],
              "accept-language": "es,en;q=0.8",
            },
          });
        } catch (error) {
          throw toFetchError(error);
        }

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location");
          await response.body?.cancel();
          if (!location) throw new FetchRejectedError("bad_redirect", "missing Location");
          try {
            url = checkUrl(new URL(location, url).toString());
          } catch (error) {
            if (error instanceof UnsafeUrlError) throw error;
            throw new FetchRejectedError("bad_redirect", location);
          }
          continue;
        }

        const contentType = response.headers.get("content-type") ?? "";
        if (response.ok && !CONTENT_TYPE_OK[kind].test(contentType)) {
          await response.body?.cancel();
          throw new FetchRejectedError("wrong_content_type", contentType || "(none)");
        }

        const body = response.ok
          ? await readCapped(response.body, MAX_BYTES[kind], charsetOf(contentType))
          : "";
        if (!response.ok) await response.body?.cancel();
        return { url: url.toString(), status: response.status, contentType, body };
      }
      throw new FetchRejectedError("too_many_redirects");
    },
  };
}

async function readCapped(
  body: { getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }>; cancel(): Promise<void> } } | null,
  maxBytes: number,
  charset: string,
): Promise<string> {
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new FetchRejectedError("too_large", `over ${maxBytes} bytes`);
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof FetchRejectedError) throw error;
    throw toFetchError(error);
  }
  return decode(Buffer.concat(chunks), charset);
}

function charsetOf(contentType: string): string {
  return /charset=["']?([\w-]+)/i.exec(contentType)?.[1] ?? "utf-8";
}

/** Older sites in the region still serve ISO-8859-1 or windows-1252. */
function decode(bytes: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

function toFetchError(error: unknown): Error {
  // undici wraps connection failures; the guard's rejection is on the cause chain.
  for (let e: unknown = error; e instanceof Error; e = e.cause) {
    if (e instanceof UnsafeUrlError) return e;
    if (e.name === "TimeoutError" || e.name === "AbortError") {
      return new FetchRejectedError("timeout");
    }
  }
  const message = error instanceof Error ? (error.cause instanceof Error ? error.cause.message : error.message) : String(error);
  return new FetchRejectedError("network", message);
}
