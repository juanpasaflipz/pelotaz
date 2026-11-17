import { connection } from "next/server";
import { systemDb } from "@/db/client";
import { es } from "@/i18n/es";
import { caseStudyCounts, type CaseStudyCounts } from "@/lib/case-study";

const t = es.marketing.caseStudy;
const number = new Intl.NumberFormat("es-MX");

/**
 * Juanberto's, with numbers read from the database on every visit. Shows
 * nothing when CASE_STUDY_BRAND_ID is unset, the brand has no posts, or the
 * database cannot be reached: an empty section is better than an invented one.
 */
export async function CaseStudy() {
  await connection();
  const brandId = process.env.CASE_STUDY_BRAND_ID;
  if (!brandId) return null;
  let counts: CaseStudyCounts;
  try {
    counts = await caseStudyCounts(systemDb(), brandId);
  } catch (error) {
    console.error("case study counts", error);
    return null;
  }
  if (counts.planned === 0) return null;

  const figures = [
    [counts.planned, t.planned],
    [counts.approved, t.approved],
    [counts.published, t.published],
  ] as const;
  return (
    <section className="bg-raya">
      <div className="mx-auto max-w-5xl px-5 py-14">
        <h2 className="display text-4xl sm:text-5xl">
          {t.title} <span className="text-marca">{t.titleHighlight}</span>
        </h2>
        <p className="mt-3 max-w-prose text-lg">{t.lead}</p>
        <dl className="mt-8 grid grid-cols-3 gap-4 border-t-2 border-tinta pt-6">
          {figures.map(([value, label]) => (
            <div key={label} className="flex flex-col-reverse">
              <dt className="mt-1 text-sm text-tinta-suave sm:text-base">{label}</dt>
              <dd className="display text-4xl sm:text-6xl">{number.format(value)}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 max-w-prose text-tinta-suave">{t.note}</p>
      </div>
    </section>
  );
}
