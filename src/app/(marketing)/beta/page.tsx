import type { Metadata } from "next";
import { Landing } from "@/components/landing";
import { landingMetadata } from "@/components/marketing/metadata";

// The link shared in the restaurant WhatsApp group: the public page, opened at
// the form, with requests tagged as coming from /beta.
export const metadata: Metadata = landingMetadata("beta");

export default function BetaPage() {
  return <Landing entry="beta" />;
}
