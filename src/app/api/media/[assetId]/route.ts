import { eq } from "drizzle-orm";
import sharp from "sharp";
import { systemDb } from "@/db/client";
import { assets } from "@/db/schema";
import { createGuardedFetcher } from "@/lib/crawl/fetcher";
import { isUuid } from "@/lib/ids";

/**
 * A brand photo as a JPEG Meta can fetch. Instagram accepts only JPEG, within
 * an aspect ratio range, so the photo from the brand's site is converted and,
 * if needed, cropped here.
 *
 * Public on purpose: Meta's servers fetch it without a session. It serves
 * only photos taken from a brand's own public website, by an unguessable id.
 */
const FEED_MIN_RATIO = 4 / 5;
const FEED_MAX_RATIO = 1.91;
const MAX_WIDTH = 1440;

export async function GET(request: Request, context: RouteContext<"/api/media/[assetId]">) {
  const { assetId } = await context.params;
  if (!isUuid(assetId)) return new Response("Not found", { status: 404 });
  const format = new URL(request.url).searchParams.get("f") === "story" ? "story" : "feed";

  // Cross-tenant by nature (Meta does not sign in); only site photos are served.
  const [asset] = await systemDb().select().from(assets).where(eq(assets.id, assetId));
  if (!asset || asset.kind !== "site_image") return new Response("Not found", { status: 404 });

  let image;
  try {
    image = await createGuardedFetcher().fetchImage(asset.storageUrl);
  } catch {
    return new Response("Source image unavailable", { status: 502 });
  }

  try {
    const source = sharp(image.bytes, { limitInputPixels: 50_000_000 }).rotate();
    const { width = 0, height = 0 } = await source.metadata();
    if (!width || !height) return new Response("Unreadable image", { status: 422 });

    let pipeline = source;
    if (format === "story") {
      // 9:16 canvas; the photo fits inside it, on white, so nothing is cut off.
      pipeline = pipeline.resize(1080, 1920, { fit: "contain", background: "#ffffff" });
    } else {
      const ratio = width / height;
      const target = Math.min(FEED_MAX_RATIO, Math.max(FEED_MIN_RATIO, ratio));
      const outWidth = Math.min(MAX_WIDTH, width);
      pipeline = pipeline.resize(outWidth, Math.round(outWidth / target), { fit: "cover", position: "attention" });
    }
    const jpeg = await pipeline.flatten({ background: "#ffffff" }).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
    return new Response(new Uint8Array(jpeg), {
      headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=86400" },
    });
  } catch {
    return new Response("Unreadable image", { status: 422 });
  }
}
