"use client";

import { useTransition } from "react";
import { chooseMetaPageAction, disconnectMetaAction } from "@/app/brands/[id]/semana/actions";
import { es } from "@/i18n/es";

const t = es.channels;

export interface ChannelsPanelProps {
  brandId: string;
  connections: Array<{ id: string; channel: "instagram" | "facebook"; name: string | null; status: string }>;
  /** `?meta=` after returning from Facebook. */
  result: string | null;
}

/** Connect the brand's Facebook Page and Instagram account so approved posts go out on their own. */
export function ChannelsPanel({ brandId, connections, result }: ChannelsPanelProps) {
  const [pending, startTransition] = useTransition();
  const active = connections.filter((c) => c.status === "active");
  const expired = connections.some((c) => c.status === "expired");
  const pages = connections.filter((c) => c.channel === "facebook" && c.status === "available");
  const activePage = active.find((c) => c.channel === "facebook");
  const activeInstagram = active.find((c) => c.channel === "instagram");
  const connectHref = `/api/connect/meta/start?brand=${brandId}`;

  return (
    <section className="mt-8 rounded-md bg-raya p-5" aria-labelledby="channels-title">
      <h2 id="channels-title" className="font-semibold">
        {t.title}
      </h2>
      {result && t.results[result] && (
        <p className={`mt-2 text-sm font-medium ${result === "connected" ? "text-cancha" : "text-chapa"}`} role="status">
          {t.results[result]}
        </p>
      )}

      {active.length === 0 && pages.length === 0 && (
        <>
          <p className="mt-1 max-w-prose text-sm">{t.lead}</p>
          <a href={connectHref} className="button button-primary mt-3">
            {t.connect}
          </a>
        </>
      )}

      {active.length === 0 && pages.length > 0 && (
        <fieldset className="mt-2">
          <legend className="text-sm">{t.choose}</legend>
          <ul className="mt-2 grid gap-2">
            {pages.map((page) => (
              <li key={page.id} className="flex flex-wrap items-center gap-3">
                <span className="font-medium">{page.name}</span>
                <button
                  type="button"
                  className="button button-quiet"
                  disabled={pending}
                  onClick={() => startTransition(async () => void (await chooseMetaPageAction(brandId, page.id)))}
                >
                  {t.usePage}
                </button>
              </li>
            ))}
          </ul>
        </fieldset>
      )}

      {active.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          {activePage && (
            <span>
              Facebook: <strong>{activePage.name}</strong>
            </span>
          )}
          {activeInstagram ? (
            <span>
              Instagram: <strong>{activeInstagram.name}</strong>
            </span>
          ) : (
            <span className="text-tinta-suave">{t.noInstagram}</span>
          )}
          <button
            type="button"
            className="underline underline-offset-4"
            disabled={pending}
            onClick={() => startTransition(async () => void (await disconnectMetaAction(brandId)))}
          >
            {t.disconnect}
          </button>
        </div>
      )}

      {expired && (
        <p className="mt-3 text-sm font-medium text-chapa">
          {t.expired}{" "}
          <a href={connectHref} className="underline underline-offset-4">
            {t.reconnect}
          </a>
        </p>
      )}
    </section>
  );
}
