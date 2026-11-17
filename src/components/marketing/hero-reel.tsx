"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { es } from "@/i18n/es";
import { trackEvent } from "./analytics";

const t = es.marketing.hero;

/**
 * "Mira cómo funciona" swaps the hero art for the 20-second reel, in place.
 * The button and the art sit in different columns, so they share state
 * through this provider. The video is not fetched until asked for.
 */
const Playing = createContext<{ playing: boolean; setPlaying: (value: boolean) => void }>({
  playing: false,
  setPlaying: () => {},
});

export function HeroReelProvider({ children }: { children: ReactNode }) {
  const [playing, setPlaying] = useState(false);
  return <Playing.Provider value={{ playing, setPlaying }}>{children}</Playing.Provider>;
}

export function HeroReelButton({ children }: { children: ReactNode }) {
  const { setPlaying } = useContext(Playing);
  return (
    <button
      type="button"
      className="button button-quiet"
      onClick={() => {
        setPlaying(true);
        trackEvent("reel_play");
        // On phones the art sits below the buttons.
        requestAnimationFrame(() =>
          document.getElementById("hero-art")?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
        );
      }}
    >
      {children}
    </button>
  );
}

export function HeroReelSlot({ children }: { children: ReactNode }) {
  const { playing, setPlaying } = useContext(Playing);
  return (
    <div id="hero-art" className="relative scroll-mt-20">
      {playing ? (
        <div className="relative mx-auto w-full max-w-[18rem]">
          <video
            className="aspect-[9/16] w-full rounded-2xl bg-tinta shadow-xl"
            src="/video/trabaja-en-pelotaz.mp4"
            poster="/video/trabaja-en-pelotaz.jpg"
            aria-label={t.reelLabel}
            controls
            autoPlay
            playsInline
            preload="none"
          />
          <button
            type="button"
            onClick={() => setPlaying(false)}
            className="absolute -right-3 -top-3 rounded-full bg-tinta px-3 py-1 text-sm font-semibold text-raya"
          >
            {t.closeReel}
          </button>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
