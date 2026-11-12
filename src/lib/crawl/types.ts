export interface FetchedResource {
  /** Final URL after redirects. */
  url: string;
  status: number;
  contentType: string;
  body: string;
}

export type ResourceKind = "html" | "text" | "css" | "xml";

/**
 * Network seam for the crawler. Production uses the SSRF-guarded fetcher in
 * fetcher.ts; tests pass an in-memory implementation.
 */
export interface PageFetcher {
  fetch(url: string, kind: ResourceKind): Promise<FetchedResource>;
}

export interface PageImage {
  url: string;
  alt: string | null;
}

/** What extraction pulls out of one page besides its text. */
export interface PageAssets {
  description: string | null;
  lang: string | null;
  ogImage: string | null;
  themeColor: string | null;
  images: PageImage[];
  logoCandidates: string[];
  socialLinks: Record<string, string>;
  stylesheets: string[];
  inlineCss: string;
  googleFonts: string[];
}

export interface CrawledPage {
  url: string;
  status: number;
  title: string | null;
  headings: string[];
  text: string;
  links: string[];
  assets: PageAssets;
}

/** Site-wide visual identity, aggregated across pages and stylesheets. */
export interface SiteVisuals {
  palette: string[];
  fonts: string[];
  logoUrl: string | null;
  referenceImages: string[];
  socialLinks: Record<string, string>;
}

export interface CrawlFailure {
  url: string;
  reason: string;
}

export interface CrawlResult {
  /** Canonical start URL after redirects. */
  startUrl: string;
  pages: CrawledPage[];
  visuals: SiteVisuals;
  failures: CrawlFailure[];
  totalTextLength: number;
  /** Languages the site publishes in (path prefixes such as /es, /en). */
  siteLanguages: string[];
  /** The one that was read, when the site has several. */
  languageRead: string | null;
}
