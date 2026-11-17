import type { Metadata } from "next";
import { GuidePage, guideMetadata } from "@/components/marketing/guide-page";
import { es } from "@/i18n/es";
import { instagramPlan } from "@/i18n/guias";

export const metadata: Metadata = guideMetadata("que-publicar-en-instagram-restaurante");

export default function Page() {
  const t = es.marketing.guides.plan;
  return (
    <GuidePage slug="que-publicar-en-instagram-restaurante">
      <section className="mb-10">
        <h2 className="display text-3xl">{t.title}</h2>
        {instagramPlan.map((week) => (
          <div key={week.week} className="mt-6">
            <h3 className="display text-2xl">
              {week.week}: <span className="text-marca">{week.theme}</span>
            </h3>
            <ol className="mt-3 grid gap-3">
              {week.posts.map((post) => (
                <li key={post.day} className="rounded border border-borde bg-raya p-4">
                  <p className="font-semibold">
                    {post.day}: {post.post}
                  </p>
                  <p className="mt-1 text-tinta-suave">
                    <span className="font-semibold text-tinta">{t.reasonLabel}</span> {post.reason}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </section>
    </GuidePage>
  );
}
