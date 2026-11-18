import type { Metadata } from "next";
import { GuidePage, guideMetadata } from "@/components/marketing/guide-page";

export const metadata: Metadata = guideMetadata("marketing-para-restaurantes");

// Which modules the page names, each with its real status chip.
export default function Page() {
  return <GuidePage slug="marketing-para-restaurantes" modules={["profile", "plan", "drafts", "publishing", "google"]} />;
}
