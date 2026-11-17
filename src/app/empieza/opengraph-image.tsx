import { shareImage, shareImageSize } from "@/components/marketing/share-image";
import { es } from "@/i18n/es";

// /empieza is where paid ads point, so its preview shows Jonás in pyjamas.
export const alt = es.marketing.hero.artLabel;
export const size = shareImageSize;
export const contentType = "image/png";

export default function Image() {
  return shareImage("pyjamas");
}
