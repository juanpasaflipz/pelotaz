/**
 * Sends one email through Resend's HTTP API. Pelotaz sends only from its own
 * verified domain, pelotaz.com.
 */

export const FROM = "Pelotaz <no-reply@pelotaz.com>";
export const REPLY_TO = "hello@pelotaz.com";

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Lets Resend drop a repeat of the same email, such as a webhook retried after a timeout. */
  idempotencyKey?: string;
}

export class EmailNotSent extends Error {
  constructor(
    message: string,
    /** Whether trying again later could work. */
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export async function sendEmail(email: OutgoingEmail, apiKey = process.env.RESEND_API_KEY): Promise<{ id: string }> {
  if (!apiKey) throw new EmailNotSent("RESEND_API_KEY is not set", false);
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        ...(email.idempotencyKey ? { "idempotency-key": email.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: FROM,
        to: [email.to],
        reply_to: REPLY_TO,
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
      signal: AbortSignal.timeout(4_000),
    });
  } catch (error) {
    throw new EmailNotSent(`Resend unreachable: ${String(error).slice(0, 120)}`, true);
  }
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 200);
    const retryable = response.status === 429 || response.status >= 500;
    throw new EmailNotSent(`Resend answered ${response.status}: ${detail}`, retryable);
  }
  return (await response.json()) as { id: string };
}
