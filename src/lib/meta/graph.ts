/**
 * The few Meta Graph API calls Pelotaz makes: Facebook Login for Business,
 * the Pages a person manages with their Instagram accounts, and publishing
 * one photo post or story. Hosts are fixed; nothing here fetches a URL a user
 * typed.
 */

export const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v26.0";

/** Pages: list and publish. Instagram: publish through the Page's token. */
export const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
];

export class MetaApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: number,
    public readonly subcode?: number,
  ) {
    super(message);
    this.name = "MetaApiError";
  }

  /** The token is no longer valid; the owner must connect again. */
  get needsReconnect() {
    return this.code === 190 || this.code === 102 || this.status === 401;
  }
}

export type FetchLike = (url: string, init?: { method?: string; body?: URLSearchParams }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export interface MetaConfig {
  appId: string;
  appSecret: string;
  /** Optional Facebook Login for Business configuration; replaces `scope` when set. */
  loginConfigId?: string;
}

export interface ManagedPage {
  id: string;
  name: string;
  accessToken: string;
  instagram: { id: string; username: string | null } | null;
}

export interface Published {
  id: string;
  permalink: string | null;
}

export function metaConfigFromEnv(): MetaConfig | null {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) return null;
  return { appId, appSecret, loginConfigId: process.env.META_LOGIN_CONFIG_ID || undefined };
}

export function loginUrl(config: MetaConfig, redirectUri: string, state: string): string {
  const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  if (config.loginConfigId) url.searchParams.set("config_id", config.loginConfigId);
  else url.searchParams.set("scope", META_SCOPES.join(","));
  return url.toString();
}

export function createGraphClient(config: MetaConfig, fetchImpl: FetchLike = fetch as unknown as FetchLike) {
  const base = `https://graph.facebook.com/${GRAPH_VERSION}`;

  async function call<T>(path: string, params: Record<string, string>, method: "GET" | "POST" = "GET"): Promise<T> {
    const url = new URL(`${base}/${path}`);
    const body = new URLSearchParams(params);
    if (method === "GET") body.forEach((value, name) => url.searchParams.set(name, value));
    const response = await fetchImpl(url.toString(), method === "POST" ? { method, body } : { method });
    const data = (await response.json().catch(() => ({}))) as {
      error?: { message?: string; code?: number; error_subcode?: number };
    };
    if (!response.ok || data.error) {
      throw new MetaApiError(
        data.error?.message ?? `Graph API ${response.status}`,
        response.status,
        data.error?.code,
        data.error?.error_subcode,
      );
    }
    return data as T;
  }

  return {
    /** Code from the login redirect → long-lived user token (about 60 days). */
    async userToken(code: string, redirectUri: string): Promise<string> {
      const short = await call<{ access_token: string }>("oauth/access_token", {
        client_id: config.appId,
        client_secret: config.appSecret,
        redirect_uri: redirectUri,
        code,
      });
      const long = await call<{ access_token: string }>("oauth/access_token", {
        grant_type: "fb_exchange_token",
        client_id: config.appId,
        client_secret: config.appSecret,
        fb_exchange_token: short.access_token,
      });
      return long.access_token;
    },

    /** Pages the person manages. Page tokens got from a long-lived user token do not expire. */
    async pages(userToken: string): Promise<ManagedPage[]> {
      const result = await call<{
        data: Array<{
          id: string;
          name: string;
          access_token: string;
          instagram_business_account?: { id: string; username?: string };
        }>;
      }>("me/accounts", {
        access_token: userToken,
        fields: "id,name,access_token,instagram_business_account{id,username}",
        limit: "100",
      });
      return result.data.map((page) => ({
        id: page.id,
        name: page.name,
        accessToken: page.access_token,
        instagram: page.instagram_business_account
          ? { id: page.instagram_business_account.id, username: page.instagram_business_account.username ?? null }
          : null,
      }));
    },

    /** One photo (JPEG at a public URL) to an Instagram feed or story. */
    async publishInstagram(
      igUserId: string,
      token: string,
      input: { imageUrl: string; caption: string; story: boolean },
      wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    ): Promise<Published> {
      const container = await call<{ id: string }>(
        `${igUserId}/media`,
        {
          access_token: token,
          image_url: input.imageUrl,
          ...(input.story ? { media_type: "STORIES" } : { caption: input.caption }),
        },
        "POST",
      );
      // Images are usually ready at once; give Meta a short while before giving up.
      for (let attempt = 0; attempt < 10; attempt++) {
        const { status_code } = await call<{ status_code?: string }>(container.id, {
          access_token: token,
          fields: "status_code",
        });
        if (status_code === "FINISHED" || status_code === undefined) break;
        if (status_code === "ERROR" || status_code === "EXPIRED") {
          throw new MetaApiError(`Instagram could not process the photo (${status_code})`, 400);
        }
        await wait(3000);
      }
      const media = await call<{ id: string }>(
        `${igUserId}/media_publish`,
        { access_token: token, creation_id: container.id },
        "POST",
      );
      const details = await call<{ permalink?: string }>(media.id, { access_token: token, fields: "permalink" }).catch(
        () => ({ permalink: undefined }),
      );
      return { id: media.id, permalink: details.permalink ?? null };
    },

    /** A Page post: with a photo when there is one, otherwise text only. */
    async publishFacebook(pageId: string, token: string, input: { imageUrl: string | null; caption: string }): Promise<Published> {
      if (input.imageUrl) {
        const photo = await call<{ id: string; post_id?: string }>(
          `${pageId}/photos`,
          { access_token: token, url: input.imageUrl, message: input.caption, published: "true" },
          "POST",
        );
        const postId = photo.post_id ?? photo.id;
        return { id: postId, permalink: `https://www.facebook.com/${postId}` };
      }
      const post = await call<{ id: string }>(`${pageId}/feed`, { access_token: token, message: input.caption }, "POST");
      return { id: post.id, permalink: `https://www.facebook.com/${post.id}` };
    },
  };
}

export type GraphClient = ReturnType<typeof createGraphClient>;
