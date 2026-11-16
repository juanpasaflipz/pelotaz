import { NextResponse } from "next/server";
import { buildAuthEmail, UnusableEvent, type NeonAuthEvent } from "@/lib/email/auth-emails";
import { EmailNotSent, sendEmail } from "@/lib/email/resend";
import { verifyNeonWebhook, WebhookError } from "@/lib/auth/webhook";

/**
 * Neon Auth calls this for `send.otp` and `send.magic_link` once webhooks are
 * switched on in the Neon console. Neon then sends no email of its own, and if
 * this handler fails every attempt the person sees an error, so it answers
 * 5xx only when a retry could help: Neon retries 5xx, 429 and 408 up to twice,
 * within 15 seconds in total, and gives up on any other 4xx.
 */

export async function POST(request: Request): Promise<NextResponse> {
  const rawBody = await request.text();

  let event: NeonAuthEvent;
  try {
    event = (await verifyNeonWebhook(rawBody, request.headers)) as NeonAuthEvent;
  } catch (error) {
    if (error instanceof WebhookError) {
      console.warn("neon-auth webhook refused", { reason: error.message });
      return NextResponse.json({ error: "unauthorized" }, { status: error.status });
    }
    throw error;
  }

  // Other events may be switched on later; acknowledge them without acting.
  if (event.event_type !== "send.otp" && event.event_type !== "send.magic_link") {
    return NextResponse.json({ ok: true, ignored: event.event_type });
  }

  try {
    const sent = await sendEmail(buildAuthEmail(event));
    // Never the address or the code in the logs.
    console.info("neon-auth email sent", { event: event.event_type, eventId: event.event_id, resendId: sent.id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof UnusableEvent) {
      console.error("neon-auth event unusable", { eventId: event.event_id, reason: error.message });
      return NextResponse.json({ error: "unusable event" }, { status: 400 });
    }
    if (error instanceof EmailNotSent) {
      console.error("neon-auth email failed", { eventId: event.event_id, reason: error.message });
      return NextResponse.json({ error: "email not sent" }, { status: error.retryable ? 502 : 500 });
    }
    throw error;
  }
}
