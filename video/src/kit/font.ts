// The app's display font (src/app/globals.css in the Next.js app), so the
// reels and the page look like one brand. Self-hosted: no font CDN at render.
import "@fontsource-variable/nunito";
import { continueRender, delayRender } from "remotion";

export const FONT = '"Nunito Variable", "Arial Rounded MT Bold", sans-serif';

// Hold every frame until the weights the kit draws with are ready.
const waiting = delayRender("Loading Nunito");
Promise.all([700, 800, 900].map((weight) => document.fonts.load(`${weight} 64px "Nunito Variable"`)))
  .then(() => continueRender(waiting))
  .catch(() => continueRender(waiting));
