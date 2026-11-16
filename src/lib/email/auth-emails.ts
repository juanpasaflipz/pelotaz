import { es } from "@/i18n/es";
import type { OutgoingEmail } from "@/lib/email/resend";

/**
 * The emails Neon Auth asks Pelotaz to send, written in Spanish with the
 * Pelotaz look. Neon's own emails are in English, so Pelotaz takes them over
 * through webhooks (see src/app/api/webhooks/neon-auth/route.ts).
 */

export type AuthEmailType = "email-verification" | "sign-in" | "forget-password";

const TYPES: AuthEmailType[] = ["email-verification", "sign-in", "forget-password"];

export interface NeonAuthEvent {
  event_id: string;
  event_type: "send.otp" | "send.magic_link" | string;
  timestamp?: string | number;
  user?: { email?: string };
  event_data?: {
    otp_code?: string;
    otp_type?: string;
    link_type?: string;
    link_url?: string;
    expires_at?: string | number;
  };
}

/** Raised when an event cannot be turned into an email; the webhook answers 400 and Neon does not retry. */
export class UnusableEvent extends Error {}

const RED = "#dc0b0b"; // --color-marca
const INK = "#1a1a1a";
const MUTED = "#505050";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Minutes until `expiresAt`, counted from when the event was raised. Null when either is missing or odd. */
export function minutesLeft(expiresAt: unknown, from: unknown): number | null {
  const toMs = (value: unknown) => {
    if (typeof value === "number") return value < 1e12 ? value * 1000 : value;
    if (typeof value === "string" && value) {
      const asNumber = Number(value);
      if (Number.isFinite(asNumber)) return asNumber < 1e12 ? asNumber * 1000 : asNumber;
      const parsed = Date.parse(value);
      return Number.isNaN(parsed) ? null : parsed;
    }
    return null;
  };
  const end = toMs(expiresAt);
  const start = toMs(from) ?? Date.now();
  if (end === null) return null;
  const minutes = Math.round((end - start) / 60_000);
  return minutes >= 1 && minutes <= 24 * 60 ? minutes : null;
}

function layout(parts: { title: string; body: string }): string {
  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(parts.title)}</title></head>
<body style="margin:0;padding:0;background:#F4F4F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F4;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#FFFFFF;border-radius:12px;overflow:hidden;">
        <tr><td style="background:${RED};padding:20px 28px;">
          <span style="display:inline-block;width:18px;height:18px;border-radius:50%;background:#FFFFFF;vertical-align:middle;"></span>
          <span style="color:#FFFFFF;font-size:22px;font-weight:800;vertical-align:middle;margin-left:8px;">Pelotaz</span>
        </td></tr>
        <tr><td style="padding:28px;">
          <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;">${escapeHtml(parts.title)}</h1>
          ${parts.body}
        </td></tr>
      </table>
      <p style="max-width:480px;margin:16px auto 0;font-size:12px;color:${MUTED};">${escapeHtml(es.authEmail.footer)}</p>
    </td></tr>
  </table>
</body>
</html>`;
}

function asType(value: unknown): AuthEmailType {
  if (typeof value === "string" && (TYPES as string[]).includes(value)) return value as AuthEmailType;
  throw new UnusableEvent(`Unknown email type: ${String(value).slice(0, 40)}`);
}

/** Builds the email for a `send.otp` or `send.magic_link` event. */
export function buildAuthEmail(event: NeonAuthEvent): OutgoingEmail {
  const to = event.user?.email;
  if (!to || !to.includes("@")) throw new UnusableEvent("Event has no recipient");
  const data = event.event_data ?? {};
  const minutes = minutesLeft(data.expires_at, event.timestamp);
  const expires = minutes ? es.authEmail.expires(minutes) : "";
  const t = es.authEmail;

  if (event.event_type === "send.otp") {
    const code = data.otp_code;
    if (!code || !/^[A-Za-z0-9]{4,12}$/.test(code)) throw new UnusableEvent("Event has no usable code");
    const copy = t.otp[asType(data.otp_type)];
    const body = `
          <p style="margin:0 0 20px;font-size:16px;line-height:1.5;">${escapeHtml(copy.lead)}</p>
          <p style="margin:0 0 20px;padding:16px;background:#FBEAEA;border-radius:8px;text-align:center;font-size:34px;font-weight:800;letter-spacing:8px;font-family:'SFMono-Regular',Menlo,Consolas,monospace;color:${INK};">${escapeHtml(code)}</p>
          ${expires ? `<p style="margin:0 0 16px;font-size:14px;color:${MUTED};">${escapeHtml(expires)}</p>` : ""}
          <p style="margin:0;font-size:14px;line-height:1.5;color:${MUTED};">${escapeHtml(t.notYou)}</p>`;
    return {
      to,
      subject: copy.subject(code),
      html: layout({ title: copy.title, body }),
      text: [copy.title, "", copy.lead, "", code, "", expires, t.notYou, "", t.footer].filter((l, i, a) => l || a[i - 1]).join("\n"),
      idempotencyKey: event.event_id,
    };
  }

  if (event.event_type === "send.magic_link") {
    const url = data.link_url;
    if (!url || !/^https:\/\//.test(url)) throw new UnusableEvent("Event has no usable link");
    const copy = t.link[asType(data.link_type)];
    const href = escapeHtml(url);
    const body = `
          <p style="margin:0 0 24px;font-size:16px;line-height:1.5;">${escapeHtml(copy.lead)}</p>
          <p style="margin:0 0 24px;"><a href="${href}" style="display:inline-block;background:${RED};color:#FFFFFF;text-decoration:none;font-weight:700;font-size:16px;padding:14px 24px;border-radius:8px;">${escapeHtml(copy.button)}</a></p>
          ${expires ? `<p style="margin:0 0 16px;font-size:14px;color:${MUTED};">${escapeHtml(expires)}</p>` : ""}
          <p style="margin:0 0 8px;font-size:13px;color:${MUTED};">${escapeHtml(t.linkFallback)}</p>
          <p style="margin:0 0 16px;font-size:13px;word-break:break-all;"><a href="${href}" style="color:${RED};">${href}</a></p>
          <p style="margin:0;font-size:14px;line-height:1.5;color:${MUTED};">${escapeHtml(t.notYouLink)}</p>`;
    return {
      to,
      subject: copy.subject,
      html: layout({ title: copy.title, body }),
      text: [copy.title, "", copy.lead, "", url, "", expires, t.notYouLink, "", t.footer].filter((l, i, a) => l || a[i - 1]).join("\n"),
      idempotencyKey: event.event_id,
    };
  }

  throw new UnusableEvent(`Not an email event: ${String(event.event_type).slice(0, 40)}`);
}
