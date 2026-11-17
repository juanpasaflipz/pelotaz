import { shareImage, shareImageSize } from "@/components/marketing/share-image";
import { es } from "@/i18n/es";

const t = es.marketing.jonas;

export const alt = t.art;
export const size = shareImageSize;
export const contentType = "image/png";

export default function Image() {
  return shareImage("pyjamas", { before: t.shareBefore, highlight: t.shareHighlight, note: t.shareNote });
}
