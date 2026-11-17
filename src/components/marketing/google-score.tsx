"use client";

import { useRef, useState } from "react";
import { es } from "@/i18n/es";
import { trackEvent } from "./analytics";

const t = es.marketing.tryIt.google;

// A half circle from 180° to 0°, radius 80, centred at (100, 100).
const ARC = "M 20 100 A 80 80 0 0 1 180 100";
const ARC_LENGTH = Math.PI * 80;

/**
 * "Tu puntaje en Google" with sample data: the 0–100 dial and three tasks.
 * Tapping a task marks it done and the dial climbs by its points.
 */
export function GoogleScore() {
  const [done, setDone] = useState<boolean[]>(() => t.tasks.map(() => false));
  const used = useRef(false);
  const score = Math.min(
    100,
    t.base + t.tasks.reduce((sum, task, index) => sum + (done[index] ? task.points : 0), 0),
  );

  return (
    <div className="grid gap-6 md:grid-cols-[16rem_1fr] md:items-center">
      <figure className="mx-auto w-full max-w-[16rem] text-center">
        <svg viewBox="0 0 200 116" role="img" aria-label={`${t.scoreLabel}: ${score} de 100`} className="w-full">
          <path d={ARC} fill="none" stroke="var(--color-borde)" strokeWidth={18} strokeLinecap="round" />
          <path
            d={ARC}
            fill="none"
            stroke="var(--color-bola)"
            strokeWidth={18}
            strokeLinecap="round"
            strokeDasharray={ARC_LENGTH}
            strokeDashoffset={ARC_LENGTH * (1 - score / 100)}
            className="transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none"
          />
          <text x={100} y={92} textAnchor="middle" className="display" fontSize={44} fill="var(--color-tinta)">
            {score}
          </text>
          <text x={100} y={112} textAnchor="middle" fontSize={11} fill="var(--color-tinta-suave)">
            {t.scoreLabel}
          </text>
        </svg>
        <figcaption className="mt-1 text-sm font-semibold">{t.business}</figcaption>
      </figure>
      <ul className="grid gap-3">
        {t.tasks.map((task, index) => (
          <li key={task.label}>
            <button
              type="button"
              aria-pressed={done[index]}
              onClick={() => {
                setDone((current) => current.map((value, i) => (i === index ? !value : value)));
                if (!used.current) {
                  used.current = true;
                  trackEvent("demo_used", { demo: "google" });
                }
              }}
              className={`flex w-full items-center gap-3 rounded-xl border-2 p-4 text-left ${done[index] ? "border-ok bg-raya" : "border-borde bg-raya"}`}
            >
              <span
                aria-hidden
                className={`flex size-7 flex-none items-center justify-center rounded-full border-2 font-bold ${done[index] ? "border-ok bg-ok text-raya" : "border-borde"}`}
              >
                {done[index] ? "✓" : ""}
              </span>
              <span className={`flex-1 ${done[index] ? "text-tinta-suave line-through" : ""}`}>{task.label}</span>
              <span className="flex-none text-sm font-semibold text-marca-profunda">
                {done[index] ? t.done : t.points(task.points)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
