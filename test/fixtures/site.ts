import type { FetchedResource, PageFetcher } from "@/lib/crawl/types";

/**
 * A small invented restaurant site, written the way real small-business sites
 * in Mexico are: Spanish slugs, a cart, a PDF menu, share links, a tracking
 * pixel, and a robots.txt that hides one section.
 */
export const ORIGIN = "https://labrasa.example";

const page = (title: string, body: string, head = "") => `<!doctype html>
<html lang="es-MX">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  ${head}
</head>
<body>
  <nav>
    <a href="/">Inicio</a>
    <a href="/menu">Menú</a>
    <a href="/nosotros/">Nosotros</a>
    <a href="/promociones">Promociones</a>
    <a href="/blog/como-asamos">Blog</a>
    <a href="/contacto">Contacto</a>
    <a href="/carrito">Carrito</a>
    <a href="/privado/panel">Panel</a>
  </nav>
  <main>${body}</main>
  <footer>
    <a href="https://www.instagram.com/labrasa.mx/">Instagram</a>
    <a href="https://www.facebook.com/sharer/sharer.php?u=https://labrasa.example">Compartir</a>
    <a href="https://wa.me/525500000000">WhatsApp</a>
    <a href="/menu.pdf">Menú en PDF</a>
    <p>Aviso de privacidad</p>
  </footer>
  <script>window.dataLayer = [{ secret: "no-debe-aparecer" }];</script>
</body>
</html>`;

const HOME = page(
  "Taquería La Brasa | Tacos al carbón en Guadalajara",
  `<h1>Tacos al carbón, como en casa de la abuela</h1>
   <p>Desde 2011 asamos arrachera y pastor sobre carbón de mezquite. Pide a domicilio o ven a la sucursal de Chapultepec.</p>
   <img src="/img/logo-labrasa.png" alt="Logo La Brasa" width="180" height="60">
   <img src="/img/tacos-arrachera.jpg" alt="Tacos de arrachera" width="1200" height="800">
   <img src="/img/pixel.gif" width="1" height="1">
   <img src="/img/icono-moto.png" alt="" width="24" height="24">`,
  `<meta name="description" content="Tacos al carbón con tortilla hecha a mano. Servicio a domicilio en Guadalajara.">
   <meta name="theme-color" content="#B3261E">
   <meta property="og:image" content="/img/portada.jpg">
   <link rel="stylesheet" href="/css/site.css">
   <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bitter:wght@400;700&family=Work+Sans&display=swap">
   <link rel="icon" href="/favicon.ico">`,
);

const MENU = page(
  "Menú | Taquería La Brasa",
  `<h1>Nuestro menú</h1>
   <ul>
     <li>Taco de arrachera — $38</li>
     <li>Taco al pastor — $24</li>
     <li>Orden de 5 tacos de pastor — $105</li>
     <li>Agua de horchata 500 ml — $30</li>
   </ul>`,
);

const NOSOTROS = page(
  "Nosotros | Taquería La Brasa",
  `<h1>Nuestra historia</h1>
   <p>Somos una familia tapatía. Empezamos con un puesto en la colonia Americana y hoy tenemos dos sucursales.</p>`,
);

const PROMOS = page(
  "Promociones | Taquería La Brasa",
  `<h1>Promociones</h1><p>Martes de 2x1 en tacos al pastor, de 6 a 10 pm.</p>`,
);

const CSS = `
  :root { --marca: #b3261e; }
  body { font-family: "Work Sans", Arial, sans-serif; color: #1a1a1a; background: #ffffff; }
  h1, h2 { font-family: Bitter, Georgia, serif; color: #b3261e; }
  .boton { background: #b3261e; color: #fff; }
  .boton:hover { background: #b5281f; }
  .etiqueta { background: rgb(242, 169, 0); }
  .destacado { border-color: rgba(242, 169, 0, 0.6); }
  .icono { font-family: "Font Awesome 6 Free"; }
  .gris { color: #777777; }
`;

const ROBOTS = `# robots de La Brasa
User-agent: *
Disallow: /privado
Disallow: /carrito

Sitemap: ${ORIGIN}/sitemap.xml
`;

const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${ORIGIN}/</loc></url>
  <url><loc>${ORIGIN}/menu</loc></url>
  <url><loc>${ORIGIN}/sucursales</loc></url>
  <url><loc>${ORIGIN}/reservar</loc></url>
  <url><loc>${ORIGIN}/privado/reportes</loc></url>
  <url><loc>https://otro-sitio.example/pagina</loc></url>
</urlset>`;

interface Route {
  status?: number;
  contentType: string;
  body: string;
  /** Simulates a redirect that ended on another URL. */
  finalUrl?: string;
}

export const ROUTES: Record<string, Route> = {
  "/": { contentType: "text/html; charset=utf-8", body: HOME },
  "/menu": { contentType: "text/html; charset=utf-8", body: MENU },
  "/nosotros": { contentType: "text/html; charset=utf-8", body: NOSOTROS },
  "/promociones": { contentType: "text/html; charset=utf-8", body: PROMOS },
  "/contacto": { status: 500, contentType: "text/html", body: "" },
  "/blog/como-asamos": {
    contentType: "text/html; charset=utf-8",
    body: page("Cómo asamos", "<h1>Cómo asamos</h1><p>El carbón de mezquite da el sabor.</p>"),
  },
  "/sucursales": {
    contentType: "text/html; charset=utf-8",
    body: page("Sucursales", "<h1>Sucursales</h1><p>Chapultepec y Providencia.</p>"),
  },
  "/reservar": {
    contentType: "text/html; charset=utf-8",
    body: "<html><body>Plataforma de reservas</body></html>",
    finalUrl: "https://reservas-externas.example/labrasa",
  },
  "/css/site.css": { contentType: "text/css", body: CSS },
  "/robots.txt": { contentType: "text/plain", body: ROBOTS },
  "/sitemap.xml": { contentType: "application/xml", body: SITEMAP },
};

export interface RecordingFetcher extends PageFetcher {
  requested: string[];
}

/** An in-memory `PageFetcher` over a route table. Unknown paths are 404s. */
export function createFixtureFetcher(
  routes: Record<string, Route> = ROUTES,
  origin: string = ORIGIN,
): RecordingFetcher {
  const requested: string[] = [];
  return {
    requested,
    async fetch(url: string): Promise<FetchedResource> {
      requested.push(url);
      const parsed = new URL(url);
      if (parsed.origin !== origin) throw new Error(`network: unexpected host ${parsed.host}`);
      const path = parsed.pathname.length > 1 ? parsed.pathname.replace(/\/+$/, "") : "/";
      const route = routes[path];
      if (!route) return { url, status: 404, contentType: "text/html", body: "" };
      const status = route.status ?? 200;
      return {
        url: route.finalUrl ?? url,
        status,
        contentType: route.contentType,
        body: status === 200 ? route.body : "",
      };
    },
  };
}
