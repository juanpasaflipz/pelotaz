import type { Metadata } from "next";
import { Landing } from "@/components/landing";
import { landingMetadata } from "@/components/marketing/metadata";

// The page every paid ad links to: the same page with everyone dressed, since
// Meta bans nudity in ads, covered or not, and reviews the page an ad points
// to. Requests from here are tagged source=empieza. Not indexed.
export const metadata: Metadata = landingMetadata("empieza");

export default function EmpiezaPage() {
  return <Landing entry="empieza" />;
}
