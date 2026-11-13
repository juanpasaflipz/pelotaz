import { systemDb } from "@/db/client";
import { createGraphClient, metaConfigFromEnv } from "@/lib/meta/graph";
import { hasEncryptionKey } from "@/lib/meta/secrets";
import type { PublishDeps } from "./service";

/** The site's public address, for links Meta must fetch and for the login redirect. */
export function appUrl(): string | null {
  const explicit = process.env.APP_URL?.replace(/\/+$/, "");
  if (explicit) return explicit;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return vercel ? `https://${vercel}` : null;
}

/** Everything publishing needs is set: the Meta app, the token key and the public address. */
export function isPublishingConfigured(): boolean {
  return metaConfigFromEnv() !== null && hasEncryptionKey() && appUrl() !== null;
}

export function metaRedirectUri(): string {
  return `${appUrl()}/api/connect/meta/callback`;
}

export function publishDeps(): PublishDeps {
  const config = metaConfigFromEnv();
  const base = appUrl();
  if (!config || !base) throw new Error("Publishing is not configured: set META_APP_ID, META_APP_SECRET and APP_URL.");
  return {
    db: systemDb(),
    graph: createGraphClient(config),
    mediaUrl: (assetId, format) => `${base}/api/media/${assetId}?f=${format}`,
  };
}
