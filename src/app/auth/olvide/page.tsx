import type { Metadata } from "next";
import { ResetWithCode } from "@/components/reset-password";
import { es } from "@/i18n/es";

export const metadata: Metadata = { title: es.auth.resetTitle };

export default function ForgotPasswordPage() {
  return (
    <main className="wall min-h-[70dvh]">
      <div className="mx-auto max-w-4xl px-5 pb-14 pt-10">
        <h1 className="display text-5xl sm:text-6xl">{es.auth.resetTitle}</h1>
        <ResetWithCode />
      </div>
    </main>
  );
}
