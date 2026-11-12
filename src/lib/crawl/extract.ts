import * as cheerio from "cheerio";
import type { CrawledPage, PageAssets, PageImage } from "./types";

const MAX_TEXT_CHARS = 20_000;
const MAX_IMAGES = 24;
const MAX_INLINE_CSS = 60_000;

const SOCIAL_HOSTS: Record<string, string> = {
  "instagram.com": "instagram",
  "facebook.com": "facebook",
  "fb.com": "facebook",
  "tiktok.com": "tiktok",
  "x.com": "x",
  "twitter.com": "x",
  "youtube.com": "youtube",
  "linkedin.com": "linkedin",
  "pinterest.com": "pinterest",
  "wa.me": "whatsapp",
  "api.whatsapp.com": "whatsapp",
};

/** Share and intent links point at the platform, not at the brand's profile. */
const SOCIAL_NOISE = /\/(sharer|share|intent|dialog|plugins|hashtag|explore)\b|[?&](u|url|text)=/i;

function absolute(href: string | undefined, base: string): string | null {
  if (!href) return null;
  const value = href.trim();
  if (!value || /^(data|javascript|mailto|tel|blob|about):/i.test(value)) return null;
  try {
    const url = new URL(value, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Image optimisers serve a resized copy: `/_next/image?url=%2Fbrand%2Flogo.png&w=96`.
 * Later steps want the original file, not a 96-pixel rendition.
 */
function originalImage(src: string | null): string | null {
  if (!src) return null;
  try {
    const url = new URL(src);
    if (url.pathname === "/_next/image" || url.pathname === "/_vercel/image") {
      const inner = url.searchParams.get("url");
      if (inner) return absolute(inner, url.origin);
    }
  } catch {
    // Fall through to the URL as given.
  }
  return src;
}

function collapse(text: string): string {
  return text.replace(/[ \t ]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
}

/** Turn one HTML document into text plus the assets later steps need. */
export function extractPage(html: string, url: string, status: number): CrawledPage {
  const $ = cheerio.load(html);
  const base = absolute($("base[href]").attr("href"), url) ?? url;

  const meta = (selector: string) => $(selector).attr("content")?.trim() || null;

  const assets: PageAssets = {
    description: meta('meta[name="description"]') ?? meta('meta[property="og:description"]'),
    lang: $("html").attr("lang")?.trim() || null,
    ogImage: originalImage(absolute(meta('meta[property="og:image"]') ?? undefined, base)),
    themeColor: meta('meta[name="theme-color"]'),
    images: [],
    logoCandidates: [],
    socialLinks: {},
    stylesheets: [],
    inlineCss: "",
    googleFonts: [],
  };

  // Stylesheets and fonts, read before any nodes are removed.
  $('link[rel~="stylesheet"][href]').each((_, el) => {
    const href = absolute($(el).attr("href"), base);
    if (!href) return;
    if (/fonts\.googleapis\.com/i.test(href)) {
      for (const family of new URL(href).searchParams.getAll("family")) {
        for (const part of family.split("|")) {
          const name = part.split(":")[0].replace(/\+/g, " ").trim();
          if (name && !assets.googleFonts.includes(name)) assets.googleFonts.push(name);
        }
      }
    } else if (!assets.stylesheets.includes(href)) {
      assets.stylesheets.push(href);
    }
  });
  let inlineCss = "";
  $("style").each((_, el) => {
    inlineCss += `${$(el).text()}\n`;
  });
  $("[style]").each((_, el) => {
    inlineCss += `x{${$(el).attr("style")}}\n`;
  });
  assets.inlineCss = inlineCss.slice(0, MAX_INLINE_CSS);

  // Logo candidates, strongest signal first.
  const logos: string[] = [];
  const pushLogo = (href: string | null) => {
    if (href && !logos.includes(href)) logos.push(href);
  };
  $("img").each((_, el) => {
    const node = $(el);
    const hint = `${node.attr("class") ?? ""} ${node.attr("id") ?? ""} ${node.attr("alt") ?? ""} ${node.attr("src") ?? ""}`;
    if (/logo/i.test(hint)) {
      pushLogo(originalImage(absolute(node.attr("src") ?? node.attr("data-src"), base)));
    }
  });
  $('link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]').each((_, el) => {
    pushLogo(absolute($(el).attr("href"), base));
  });
  $('link[rel~="icon"]').each((_, el) => pushLogo(absolute($(el).attr("href"), base)));
  assets.logoCandidates = logos.slice(0, 6);

  // Content images: skip trackers, icons and sprites.
  const images: PageImage[] = [];
  $("img").each((_, el) => {
    if (images.length >= MAX_IMAGES) return;
    const node = $(el);
    const src = originalImage(
      absolute(node.attr("src") ?? node.attr("data-src") ?? node.attr("data-lazy-src"), base),
    );
    if (!src || /\.(svg|gif)(\?|$)/i.test(src)) return;
    const width = Number(node.attr("width"));
    const height = Number(node.attr("height"));
    if ((width && width < 120) || (height && height < 120)) return;
    if (/(sprite|pixel|tracking|spacer|icon)/i.test(src) || logos.includes(src)) return;
    if (images.some((image) => image.url === src)) return;
    images.push({ url: src, alt: node.attr("alt")?.trim() || null });
  });
  assets.images = images;

  // Links: social profiles are kept apart from crawlable links.
  const links: string[] = [];
  $("a[href]").each((_, el) => {
    const href = absolute($(el).attr("href"), base);
    if (!href) return;
    const host = new URL(href).hostname.replace(/^(www|m|web)\./, "");
    const network = SOCIAL_HOSTS[host];
    if (network) {
      const path = new URL(href).pathname;
      if (!assets.socialLinks[network] && path.length > 1 && !SOCIAL_NOISE.test(href)) {
        assets.socialLinks[network] = href;
      }
      return;
    }
    if (!links.includes(href)) links.push(href);
  });

  const title = $("title").first().text().trim() || meta('meta[property="og:title"]');
  const headings = $("h1, h2, h3")
    .map((_, el) => collapse($(el).text()))
    .get()
    .filter(Boolean)
    .slice(0, 40);

  // Main text. Navigation and boilerplate repeat on every page and drown the signal.
  $("script, style, noscript, template, svg, iframe, form, nav, footer, aside").remove();
  $('[aria-hidden="true"], [hidden], .cookie, .cookies, #cookie-banner').remove();
  const root = $("main").length ? $("main").first() : $("body");
  root.find("br").replaceWith("\n");
  // Two buttons or links side by side have no whitespace between them in the
  // markup; without this their labels fuse into one word.
  root.find("a, button").each((_, el) => {
    if (el.next?.type === "tag") $(el).after(" ");
  });
  root.find("p, li, h1, h2, h3, h4, h5, h6, tr, div, section, article").each((_, el) => {
    $(el).append("\n");
  });
  const text = collapse(root.text()).slice(0, MAX_TEXT_CHARS);

  return { url, status, title, headings, text, links, assets };
}

// ---------------------------------------------------------------------------
// Visual identity from CSS
// ---------------------------------------------------------------------------

const GENERIC_FONTS = new Set([
  "serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-sans-serif",
  "ui-serif", "ui-monospace", "ui-rounded", "emoji", "math", "fangsong", "inherit", "initial",
  "unset", "revert", "-apple-system", "blinkmacsystemfont", "segoe ui", "roboto", "helvetica",
  "helvetica neue", "arial", "noto sans", "liberation sans", "apple color emoji",
  "segoe ui emoji", "segoe ui symbol", "noto color emoji", "times new roman", "times",
  "courier new", "courier", "georgia", "verdana", "tahoma", "trebuchet ms", "menlo", "monaco",
  "consolas", "sfmono-regular", "liberation mono",
]);

const ICON_FONT = /(icon|awesome|glyph|symbol|material|swiper|slick|dashicons|elementor|eicons)/i;

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0")).join("")}`;
}

function normalizeHex(value: string): string | null {
  const hex = value.replace("#", "").toLowerCase();
  if (hex.length === 3 || hex.length === 4) {
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
  }
  if (hex.length === 6 || hex.length === 8) return `#${hex.slice(0, 6)}`;
  return null;
}

/** Lightness in HSL terms, 0 to 1. */
function lightness(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
}

/** Saturation in HSL terms, 0 to 1. Greys, whites and blacks score near zero. */
function saturation(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const lightness = (max + min) / 2;
  return (max - min) / (1 - Math.abs(2 * lightness - 1));
}

function distance(a: string, b: string): number {
  const channel = (hex: string, i: number) => parseInt(hex.slice(i, i + 2), 16);
  return Math.hypot(
    channel(a, 1) - channel(b, 1),
    channel(a, 3) - channel(b, 3),
    channel(a, 5) - channel(b, 5),
  );
}

/**
 * Pick brand colors from CSS by how often each saturated color is used.
 * This is a heuristic: it finds the colors a stylesheet leans on, which is
 * usually the brand palette, and the user confirms or corrects it in the editor.
 */
export function extractPalette(css: string, themeColor: string | null, limit = 5): string[] {
  const counts = new Map<string, number>();
  const bump = (hex: string | null, weight = 1) => {
    if (hex) counts.set(hex, (counts.get(hex) ?? 0) + weight);
  };

  for (const match of css.matchAll(/#([0-9a-f]{3,8})\b/gi)) bump(normalizeHex(match[0]));
  for (const match of css.matchAll(/rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/gi)) {
    bump(toHex(Number(match[1]), Number(match[2]), Number(match[3])));
  }
  // A declared theme color is the site telling us its brand color.
  const theme = themeColor && /^#[0-9a-f]{3,8}$/i.test(themeColor) ? normalizeHex(themeColor) : null;
  bump(theme, 1000);

  const ranked = [...counts.entries()]
    // Tinted page backgrounds (cream, off-black) score as "saturated" in HSL
    // but are not brand colors; a declared theme color is kept whatever it is.
    .filter(([hex]) => hex === theme || (saturation(hex) >= 0.25 && lightness(hex) > 0.12 && lightness(hex) < 0.9))
    .sort((a, b) => b[1] - a[1])
    .map(([hex]) => hex);

  const palette: string[] = [];
  for (const hex of ranked) {
    // Skip near-duplicates such as hover shades of the same color.
    if (palette.every((kept) => distance(kept, hex) > 48)) palette.push(hex);
    if (palette.length >= limit) break;
  }
  return palette;
}

/** Brand typefaces: declared families minus system fallbacks and icon fonts. */
export function extractFonts(css: string, googleFonts: string[], limit = 4): string[] {
  const counts = new Map<string, number>();
  for (const name of googleFonts) counts.set(name, 1000);

  for (const match of css.matchAll(/font-family\s*:\s*([^;}{]+)/gi)) {
    const first = match[1].split(",")[0].replace(/!important/i, "").replace(/["']/g, "").trim();
    if (!first || first.startsWith("var(") || first.length > 60) continue;
    if (GENERIC_FONTS.has(first.toLowerCase()) || ICON_FONT.test(first)) continue;
    // Next.js generates "<Font> Fallback" faces to hold layout while fonts load.
    if (/ fallback$/i.test(first)) continue;
    counts.set(first, (counts.get(first) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name)
    .slice(0, limit);
}
