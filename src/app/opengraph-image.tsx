import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { JonasOnCouch } from "@/components/marketing/jonas";
import { es } from "@/i18n/es";

// The preview WhatsApp, Facebook and others show when someone shares pelotaz.com.
export const alt = es.marketing.hero.artLabel;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The logo's red and the app's display font (src/app/globals.css).
const RED = "#f40a0a";
const MARCA = "#dc0b0b";

export default async function Image() {
  const nunito = await readFile(
    join(process.cwd(), "node_modules/@fontsource/nunito/files/nunito-latin-800-normal.woff"),
  );
  const t = es.marketing.hero;
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: "#ffffff", fontFamily: "Nunito" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: 620, padding: "0 0 0 70px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 40, color: "#505050" }}>
            <div style={{ width: 44, height: 44, borderRadius: 22, background: RED }} />
            {es.app.name}
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 28, fontSize: 84, lineHeight: 1.02, color: "#1a1a1a" }}>
            <span>{t.titleBefore}</span>
            <span style={{ color: MARCA }}>{t.titleHighlight}</span>
          </div>
          <div style={{ marginTop: 28, fontSize: 32, color: "#505050" }}>{t.note}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", width: 580 }}>
          <div style={{ display: "flex", width: 560, height: 539 }}>
            <JonasOnCouch label="" red={RED} width={560} />
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: "Nunito", data: nunito, weight: 800, style: "normal" }] },
  );
}
