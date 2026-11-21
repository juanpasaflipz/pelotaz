import { es } from "@/i18n/es";
import { escapeHtml, layout, MUTED, RED } from "@/lib/email/auth-emails";
import { sendEmail, type OutgoingEmail } from "@/lib/email/resend";

/**
 * The one email a new workspace gets from Pelotaz: what to do first and where.
 * Sent once, when the workspace is opened.
 */
export function buildWelcomeEmail(to: string, tenantId: string, appUrl: string): OutgoingEmail {
  const t = es.welcomeEmail;
  const href = escapeHtml(appUrl);
  const steps = t.steps.map((step) => `<li style="margin:0 0 8px;">${escapeHtml(step)}</li>`).join("");
  const body = `
          <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">${escapeHtml(t.lead)}</p>
          <ol style="margin:0 0 24px;padding-left:20px;font-size:16px;line-height:1.5;">${steps}</ol>
          <p style="margin:0 0 24px;"><a href="${href}" style="display:inline-block;background:${RED};color:#FFFFFF;text-decoration:none;font-weight:700;font-size:16px;padding:14px 24px;border-radius:8px;">${escapeHtml(t.button)}</a></p>
          <p style="margin:0;font-size:14px;line-height:1.5;color:${MUTED};">${escapeHtml(t.help)}</p>`;
  return {
    to,
    subject: t.subject,
    html: layout({ title: t.title, body }),
    text: [t.title, "", t.lead, "", ...t.steps.map((step, i) => `${i + 1}. ${step}`), "", appUrl, "", t.help, "", es.authEmail.footer].join("\n"),
    // One per workspace, even if two requests race to open it.
    idempotencyKey: `welcome:${tenantId}`,
  };
}

/** Never throws: a welcome that fails to send must not block the person's first page. */
export async function sendWelcomeEmail(to: string, tenantId: string, appUrl: string): Promise<boolean> {
  try {
    await sendEmail(buildWelcomeEmail(to, tenantId, appUrl));
    return true;
  } catch (error) {
    console.error("welcome email not sent", { tenantId, error: error instanceof Error ? error.message : error });
    return false;
  }
}
