import Link from "next/link";
import { JonasOnCouch } from "@/components/marketing/jonas";
import { es } from "@/i18n/es";

const t = es.marketing.notFound;

// Any address that does not exist, in the app or on the public page.
export default function NotFound() {
  return (
    <main className="mx-auto grid max-w-4xl items-center gap-8 px-5 py-14 md:grid-cols-2">
      <div>
        <h1 className="display text-5xl sm:text-6xl">
          {t.title} <span className="text-marca">{t.titleHighlight}</span>
        </h1>
        <p className="mt-4 max-w-md text-lg">{t.lead}</p>
        <Link href="/" className="button button-primary mt-7">
          {t.home}
        </Link>
      </div>
      <div className="relative">
        <JonasOnCouch label={t.art} className="h-auto w-full" />
        <span aria-hidden className="absolute left-[52%] top-0 rounded-full bg-raya px-3 py-1 text-3xl shadow-md">
          💤
        </span>
      </div>
    </main>
  );
}
