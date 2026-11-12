import { discoverUrls, loadRobots, normalizeUrl, siteKey } from "./discover";
import { isAllowed } from "./robots";
import { extractFonts, extractPage, extractPalette } from "./extract";
import type { CrawlFailure, CrawlResult, CrawledPage, PageFetcher, SiteVisuals } from "./types";
import { UnsafeUrlError } from "./url-guard";

export interface CrawlOptions {
  maxPages?: number;
  concurrency?: number;
  maxStylesheets?: number;
}

export class CrawlError extends Error {
  constructor(
    public readonly reason: "home_unreachable" | "home_not_html" | "blocked_by_robots",
    detail?: string,
  ) {
    super(detail ? `${reason}: ${detail}` : reason);
    this.name = "CrawlError";
  }
}

const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Read a brand's site: the home page, then the most informative pages it links
 * to or lists in its sitemap, up to `maxPages`. Individual page failures are
 * recorded and skipped; only an unreachable home page fails the crawl.
 */
export async function crawlSite(
  fetcher: PageFetcher,
  startUrl: string,
  options: CrawlOptions = {},
): Promise<CrawlResult> {
  const maxPages = options.maxPages ?? 20;
  const concurrency = options.concurrency ?? 4;
  const maxStylesheets = options.maxStylesheets ?? 3;

  // Rules before requests: if the site tells crawlers to stay out, we do.
  const requested = new URL(startUrl);
  let rules = await loadRobots(fetcher, requested.origin);
  if (!isAllowed(rules, requested.pathname)) throw new CrawlError("blocked_by_robots");

  // The home page's final URL (after redirects) defines the site.
  let home: CrawledPage;
  try {
    const resource = await fetcher.fetch(startUrl, "html");
    if (resource.status !== 200) {
      throw new CrawlError("home_unreachable", `HTTP ${resource.status}`);
    }
    home = extractPage(resource.body, normalizeUrl(resource.url) ?? resource.url, resource.status);
  } catch (error) {
    // An unsafe URL is a different problem from an unreachable one; keep it distinct.
    if (error instanceof CrawlError || error instanceof UnsafeUrlError) throw error;
    const reason = reasonOf(error);
    throw new CrawlError(
      reason.startsWith("wrong_content_type") ? "home_not_html" : "home_unreachable",
      reason,
    );
  }

  const landed = new URL(home.url);
  if (landed.origin !== requested.origin) {
    rules = await loadRobots(fetcher, landed.origin);
    if (!isAllowed(rules, landed.pathname)) throw new CrawlError("blocked_by_robots");
  }

  const urls = await discoverUrls(fetcher, home.url, home.links, rules, maxPages);

  const homePath = new URL(home.url).pathname;
  const remaining = urls.filter((url) => new URL(url).pathname !== homePath).slice(0, maxPages - 1);
  const pages: CrawledPage[] = [home];
  const failures: CrawlFailure[] = [];

  let next = 0;
  const worker = async () => {
    while (next < remaining.length) {
      const url = remaining[next++];
      try {
        const resource = await fetcher.fetch(url, "html");
        if (resource.status !== 200) {
          failures.push({ url, reason: `HTTP ${resource.status}` });
          continue;
        }
        // A redirect can leave the site (e.g. to a booking platform). Do not follow it there.
        if (siteKey(resource.url) !== siteKey(home.url)) {
          failures.push({ url, reason: "redirected_off_site" });
          continue;
        }
        pages.push(extractPage(resource.body, url, resource.status));
      } catch (error) {
        failures.push({ url, reason: reasonOf(error) });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, remaining.length) }, worker));

  // Keep discovery order so storage and prompts are deterministic.
  const order = new Map(urls.map((url, index) => [url, index]));
  pages.sort((a, b) => (order.get(a.url) ?? -1) - (order.get(b.url) ?? -1));

  const visuals = await collectVisuals(fetcher, home, pages, maxStylesheets);
  const totalTextLength = pages.reduce((sum, page) => sum + page.text.length, 0);
  return { startUrl: home.url, pages, visuals, failures, totalTextLength };
}

async function collectVisuals(
  fetcher: PageFetcher,
  home: CrawledPage,
  pages: CrawledPage[],
  maxStylesheets: number,
): Promise<SiteVisuals> {
  let css = home.assets.inlineCss;
  for (const href of home.assets.stylesheets.slice(0, maxStylesheets)) {
    try {
      const sheet = await fetcher.fetch(href, "css");
      if (sheet.status === 200) css += `\n${sheet.body}`;
    } catch {
      // Stylesheets on a CDN that refuses us only cost palette accuracy.
    }
  }

  const socialLinks: Record<string, string> = {};
  for (const page of pages) {
    for (const [network, href] of Object.entries(page.assets.socialLinks)) {
      socialLinks[network] ??= href;
    }
  }

  const referenceImages: string[] = [];
  const addImage = (url: string | null) => {
    if (url && !referenceImages.includes(url) && referenceImages.length < 12) {
      referenceImages.push(url);
    }
  };
  addImage(home.assets.ogImage);
  for (const page of pages) for (const image of page.assets.images) addImage(image.url);

  return {
    palette: extractPalette(css, home.assets.themeColor),
    fonts: extractFonts(css, home.assets.googleFonts),
    logoUrl: home.assets.logoCandidates[0] ?? null,
    referenceImages,
    socialLinks,
  };
}
