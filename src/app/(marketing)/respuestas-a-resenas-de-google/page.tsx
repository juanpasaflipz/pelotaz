import type { Metadata } from "next";
import { GuidePage, guideMetadata } from "@/components/marketing/guide-page";
import { es } from "@/i18n/es";
import { reviewReplies } from "@/i18n/guias";

export const metadata: Metadata = guideMetadata("respuestas-a-resenas-de-google");

export default function Page() {
  const t = es.marketing.guides.reviews;
  return (
    <GuidePage slug="respuestas-a-resenas-de-google">
      <section className="mb-10">
        <h2 className="display text-3xl">{t.title}</h2>
        <p className="mt-3 max-w-prose text-lg">{t.lead}</p>
        <ul className="mt-5 grid gap-4">
          {reviewReplies.map((item) => (
            <li key={item.situation} className="rounded border border-borde bg-raya p-4">
              <h3 className="display text-xl">{item.situation}</h3>
              <p className="mt-2 text-lg">{item.reply}</p>
            </li>
          ))}
        </ul>
      </section>
    </GuidePage>
  );
}
