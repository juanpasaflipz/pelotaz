"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { es } from "@/i18n/es";
import { trackEvent } from "../analytics";
import { NAME_MAX, REEL_COLORS } from "./story";

const t = es.marketing.tryIt.reel;

// Remotion and the kit load only once the demo is near the screen.
const ReelPlayer = dynamic(() => import("./reel-player"), {
  ssr: false,
  loading: () => <Placeholder />,
});

function Placeholder() {
  return (
    <div className="flex aspect-[9/16] w-full items-center justify-center rounded-2xl bg-tinta text-sm text-raya">
      <span className="flex items-center gap-2">
        <span aria-hidden className="ball ball-bouncing" />
        {t.loading}
      </span>
    </div>
  );
}

/** "Tu reel en vivo": the visitor's name and colour, in the real reel, as they type. */
export function ReelDemo() {
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(REEL_COLORS[0]);
  const [near, setNear] = useState(false);
  const used = useRef(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const watch = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          watch.disconnect();
        }
      },
      { rootMargin: "400px" },
    );
    watch.observe(element);
    return () => watch.disconnect();
  }, []);

  const markUsed = () => {
    if (used.current) return;
    used.current = true;
    trackEvent("demo_used", { demo: "reel" });
  };

  return (
    <div ref={box} className="grid gap-6 md:grid-cols-[1fr_18rem] md:items-start">
      <div>
        <label className="grid gap-1.5 font-semibold">
          {t.nameLabel}
          <input
            className="field"
            value={name}
            maxLength={NAME_MAX}
            placeholder={t.placeholder}
            onChange={(event) => {
              setName(event.target.value);
              markUsed();
            }}
          />
        </label>
        <fieldset className="mt-5">
          <legend className="font-semibold">{t.colorLabel}</legend>
          <div className="mt-2 flex flex-wrap gap-3">
            {REEL_COLORS.map((option, index) => (
              <label key={option} className="relative cursor-pointer">
                <input
                  type="radio"
                  name="reel-color"
                  value={option}
                  checked={color === option}
                  onChange={() => {
                    setColor(option);
                    markUsed();
                  }}
                  className="peer sr-only"
                />
                <span
                  aria-hidden
                  className="block size-10 rounded-full border-4 border-raya shadow ring-2 ring-transparent peer-checked:ring-tinta peer-focus-visible:ring-tinta"
                  style={{ background: option }}
                />
                <span className="sr-only">{t.colorNames[index]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <p className="mt-5 text-sm text-tinta-suave">{t.note}</p>
      </div>
      <div className="mx-auto w-full max-w-[18rem]">{near ? <ReelPlayer name={name} color={color} /> : <Placeholder />}</div>
    </div>
  );
}
