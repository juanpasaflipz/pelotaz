import * as cheerio from "cheerio";
import { isAllowed, NO_RULES, parseRobots, type RobotsRules } from "./robots";
import type { PageFetcher } from "./types";

/** `www.tacos.mx` and `tacos.mx` are the same site for crawling purposes. */
export function siteKey(url: string | URL): string {
  return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
}

const SKIP_EXTENSION =
  /\.(pdf|jpe?g|png|gif|webp|avif|svg|ico|css|js|json|xml|zip|rar|mp4|mov|mp3|wav|docx?|xlsx?|pptx?|woff2?|ttf)$/i;

/** Pages that are private, transactional or infinite, in Spanish and English. */
const SKIP_PATH =
  /\/(wp-admin|wp-json|wp-login|admin|login|logout|signin|signup|register|registro|iniciar-sesion|cuenta|mi-cuenta|account|cart|carrito|checkout|pago|pagar|search|buscar|tag|tags|feed|cdn-cgi|privacy|privacidad|aviso-de-privacidad|terms|terminos|cookies|legal)(\/|$)/i;

/**
 * Which pages say the most about a brand, most informative first. Spanish
 * paths come first because that is the market, English because many sites
 * in the region use English slugs.
 */
const PRIORITY: Array<[RegExp, number]> = [
  [/\/(nosotros|quienes-somos|acerca|acerca-de|sobre|sobre-nosotros|historia|about|about-us|our-story|story)(\/|$)/i, 90],
  [/\/(menu|carta|productos|producto|servicios|servicio|catalogo|tienda|ingredientes|products|services|shop|store|collections|ingredients)(\/|$)/i, 85],
  [/\/(precios|planes|tarifas|paquetes|pricing|plans)(\/|$)/i, 80],
  [/\/(promociones|promos|ofertas|descuentos|offers|deals|sale)(\/|$)/i, 75],
  [/\/(preguntas-frecuentes|faq|faqs|ayuda|help)(\/|$)/i, 60],
  [/\/(testimonios|opiniones|resenas|clientes|casos|reviews|testimonials)(\/|$)/i, 55],
  [/\/(sucursales|ubicaciones|ubicacion|locations|contacto|contact)(\/|$)/i, 45],
  [/\/(blog|noticias|novedades|news|articulos)(\/|$)/i, 30],
];

const LANGUAGES = new Set(["es", "en", "pt", "fr", "de", "it", "ca"]);

/**
 * Sites that publish in several languages usually prefix the path: `/es/menu`,
 * `/en/menu`, `/pt-br/menu`. Returns that language, or null when the first
 * segment is not a language code.
 */
export function pathLanguage(pathname: string): string | null {
  const first = pathname.split("/").filter(Boolean)[0]?.toLowerCase() ?? "";
  const match = /^([a-z]{2})(?:-[a-z]{2})?$/.exec(first);
  return match && LANGUAGES.has(match[1]) ? match[1] : null;
}

function score(url: URL): number {
  const segments = url.pathname.split("/").filter(Boolean);
  // A language prefix is not depth: `/es/menu` is as close to the top as `/menu`.
  const depth = pathLanguage(url.pathname) ? segments.length - 1 : segments.length;
  if (depth === 0) return 100;
  const base = PRIORITY.find(([pattern]) => pattern.test(url.pathname))?.[1] ?? 20;
  // A section's index says more than one item inside it; queries are usually filters.
  return base - (depth - 1) * 8 - (url.search ? 15 : 0);
}

/** Enough pages in the wanted language that the other languages are translations, not the site. */
const MIN_PAGES_TO_PREFER_LANGUAGE = 3;

export function normalizeUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_|ref$|source$)/i.test(key)) url.searchParams.delete(key);
    }
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return null;
  }
}

/** Filter to crawlable same-site pages and order them by how much they tell us. */
export function prioritize(
  candidates: string[],
  startUrl: string,
  rules: RobotsRules,
  limit: number,
  /** Two-letter language of the content being built, e.g. "es". */
  language?: string,
): string[] {
  const site = siteKey(startUrl);
  const seen = new Set<string>();
  const kept: Array<{ url: string; score: number; order: number }> = [];

  candidates.forEach((candidate, order) => {
    const normalized = normalizeUrl(candidate);
    if (!normalized) return;
    const url = new URL(normalized);
    if (siteKey(url) !== site) return;
    if (SKIP_EXTENSION.test(url.pathname) || SKIP_PATH.test(url.pathname)) return;
    if (!isAllowed(rules, url.pathname)) return;
    // The same page is often linked with and without www or a trailing slash.
    const key = `${url.pathname}${url.search}`;
    if (seen.has(key)) return;
    seen.add(key);
    kept.push({ url: normalized, score: score(url), order });
  });

  // On a multilingual site, read the language we will write in. Translations
  // of the same pages would spend the page budget twice and blur the voice.
  let pages = kept;
  if (language) {
    const inLanguage = kept.filter((e) => pathLanguage(new URL(e.url).pathname) === language);
    if (inLanguage.length >= MIN_PAGES_TO_PREFER_LANGUAGE) {
      pages = kept.filter((e) => {
        const lang = pathLanguage(new URL(e.url).pathname);
        return lang === null || lang === language;
      });
    }
  }

  return pages
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map((entry) => entry.url);
}

function locsOf(xml: string): string[] {
  const $ = cheerio.load(xml, { xml: true });
  return $("loc")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);
}

const MAX_SITEMAP_URLS = 2_000;
const MAX_CHILD_SITEMAPS = 3;

/** URLs from sitemap.xml, following one level of sitemap index. Empty on any failure. */
async function readSitemaps(fetcher: PageFetcher, sitemapUrls: string[], site: string): Promise<string[]> {
  const urls: string[] = [];
  const queue = sitemapUrls.slice(0, MAX_CHILD_SITEMAPS);
  let followed = 0;

  while (queue.length > 0 && urls.length < MAX_SITEMAP_URLS) {
    const sitemapUrl = queue.shift()!;
    if (siteKey(sitemapUrl) !== site) continue;
    try {
      const resource = await fetcher.fetch(sitemapUrl, "xml");
      if (resource.status !== 200) continue;
      const locs = locsOf(resource.body);
      if (/<sitemapindex/i.test(resource.body)) {
        // Prefer page sitemaps over post or product ones when there are many.
        const children = locs.sort(
          (a, b) => Number(/page/i.test(b)) - Number(/page/i.test(a)),
        );
        for (const child of children) {
          if (followed >= MAX_CHILD_SITEMAPS) break;
          queue.push(child);
          followed++;
        }
      } else {
        urls.push(...locs.slice(0, MAX_SITEMAP_URLS - urls.length));
      }
    } catch {
      // A missing or malformed sitemap is normal; links from the home page cover it.
    }
  }
  return urls;
}

/** The crawl rules a site publishes. A missing or unreadable robots.txt means no restrictions. */
export async function loadRobots(fetcher: PageFetcher, origin: string): Promise<RobotsRules> {
  try {
    const robots = await fetcher.fetch(`${origin}/robots.txt`, "text");
    if (robots.status === 200) return parseRobots(robots.body);
  } catch {
    // Fall through.
  }
  return NO_RULES;
}

export interface Discovery {
  urls: string[];
  /** Languages the site publishes in, from its path prefixes. Empty when it does not use them. */
  languages: string[];
}

/**
 * Decide which pages to read, using sitemaps and the home page's own links as
 * candidates. `homeLinks` come from the already-fetched home page so it is not
 * requested twice.
 */
export async function discoverUrls(
  fetcher: PageFetcher,
  startUrl: string,
  homeLinks: string[],
  rules: RobotsRules,
  limit: number,
  language?: string,
): Promise<Discovery> {
  const origin = new URL(startUrl).origin;
  const site = siteKey(startUrl);
  const sitemapUrls = rules.sitemaps.length > 0 ? rules.sitemaps : [`${origin}/sitemap.xml`];
  const fromSitemaps = await readSitemaps(fetcher, sitemapUrls, site);
  const candidates = [startUrl, ...homeLinks, ...fromSitemaps];

  const languages = new Set<string>();
  for (const candidate of candidates) {
    try {
      const url = new URL(candidate);
      const found = siteKey(url) === site ? pathLanguage(url.pathname) : null;
      if (found) languages.add(found);
    } catch {
      // Not a URL; prioritize() drops it too.
    }
  }

  // Home links first: what the site chooses to put in its navigation is a
  // better signal of importance than sitemap order.
  return {
    urls: prioritize(candidates, startUrl, rules, limit, language),
    languages: [...languages].sort(),
  };
}
