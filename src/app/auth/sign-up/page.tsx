import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { es } from "@/i18n/es";

export const metadata: Metadata = { title: es.auth.signUp };

export default function Page() {
  return (
    <main className="wall min-h-[70dvh]">
      <div className="mx-auto max-w-4xl px-5 pb-14 pt-10">
        <h1 className="display text-5xl sm:text-6xl">{es.auth.signUpTitle}</h1>
        <AuthForm mode="sign-up" />
      </div>
    </main>
  );
}
