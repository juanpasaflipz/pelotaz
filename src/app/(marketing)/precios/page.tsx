import type { Metadata } from "next";
import { Landing } from "@/components/landing";
import { landingMetadata } from "@/components/marketing/metadata";

// The public page, opened at pricing.
export const metadata: Metadata = landingMetadata("precios");

export default function PreciosPage() {
  return <Landing entry="precios" />;
}
