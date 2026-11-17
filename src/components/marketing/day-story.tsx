import { BallMark } from "@/components/logo";
import { es } from "@/i18n/es";
import { JonasOnCouch, type Outfit } from "./jonas";
import { statusOf, type ModuleId } from "./modules";
import { StatusChip } from "./status-chip";

const t = es.marketing.day;

/** Each beat owns an equal slice of the section's scroll. */
const SLICE = 100 / t.beats.length;
const range = (from: number, to: number) => `contain ${from.toFixed(1)}% contain ${to.toFixed(1)}%`;

/**
 * "Un día en Pelotaz": a pinned phone with Jonás's chat, filling in as the
 * visitor scrolls through the day. Pure CSS (scroll-driven animations), no
 * JavaScript. Shown only on wide screens whose browser supports it and whose
 * owner has not asked for less motion; everyone else gets the cards in
 * landing.tsx. See `.day-story` in globals.css.
 */
export function DayStory({ outfit = "none" }: { outfit?: Outfit }) {
  return (
    <div className="day-story" aria-label={t.storyLabel}>
      <div className="day-sticky mx-auto grid max-w-5xl grid-cols-[1fr_320px] items-center gap-12 px-5">
        <div>
          <div className="relative">
            <JonasOnCouch label="" className="h-auto w-full max-w-md" outfit={outfit} />
            {t.beats.map((beat, index) => (
              <span
                key={beat.time}
                aria-hidden
                className="day-only absolute left-[52%] top-0 rounded-full bg-raya px-3 py-1 text-3xl shadow-md"
                style={{
                  animationRange: range(index * SLICE, (index + 1) * SLICE),
                }}
              >
                {beat.mood}
              </span>
            ))}
          </div>
          <div className="relative mt-4 h-44">
            {t.beats.map((beat, index) => {
              const moduleId = beat.module as ModuleId;
              const last = index === t.beats.length - 1;
              return (
                <div
                  key={beat.time}
                  className={`${last ? "day-in" : "day-only"} absolute inset-0`}
                  style={{
                    animationRange: range(index * SLICE, last ? index * SLICE + 6 : (index + 1) * SLICE),
                  }}
                >
                  <p className="display text-4xl text-marca">{beat.time}</p>
                  <h3 className="display mt-1 text-2xl">{beat.title}</h3>
                  <p className="mt-1 max-w-md text-tinta-suave">{beat.body}</p>
                  <p className="mt-3 flex flex-wrap items-center gap-2">
                    <StatusChip status={statusOf(moduleId)} />
                    <a href={`#modulo-${moduleId}`} className="text-sm font-semibold underline underline-offset-4">
                      {t.seeModule}
                    </a>
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="overflow-hidden rounded-[2.5rem] border-[10px] border-tinta bg-[#efe7dd] shadow-xl">
          <div className="flex items-center gap-3 bg-tinta px-4 py-3 text-raya">
            <BallMark className="size-8" />
            <div>
              <p className="font-semibold leading-tight">{t.chatName}</p>
              <p className="text-xs opacity-80">{t.chatStatus}</p>
            </div>
          </div>
          <ol className="flex h-[26rem] flex-col justify-end overflow-hidden p-3">
            {t.beats.flatMap((beat, index) =>
              beat.chat.map((message, order) => {
                const start = index * SLICE + 2 + order * 7;
                const mine = message.from === "jonas";
                return (
                  <li
                    key={`${beat.time}-${order}`}
                    className={`day-msg max-w-[85%] rounded-xl px-3 py-2 text-sm shadow-sm ${mine ? "self-end bg-[#d9fdd3]" : "self-start bg-raya"}`}
                    style={{ animationRange: range(start, start + 5) }}
                  >
                    {message.text}
                  </li>
                );
              }),
            )}
          </ol>
        </div>
      </div>
    </div>
  );
}
