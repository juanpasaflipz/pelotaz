import { shareImage, shareImageSize } from "@/components/marketing/share-image";
import { es } from "@/i18n/es";

// The preview WhatsApp, Facebook and others show when someone shares pelotaz.com.
export const alt = es.marketing.hero.artLabel;
export const size = shareImageSize;
export const contentType = "image/png";

export default function Image() {
  return shareImage();
}
