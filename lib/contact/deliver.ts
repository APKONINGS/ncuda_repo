import "server-only";
import type { ContactInput } from "./schema";

export type DeliveryResult = { delivered: true } | { delivered: false; reason: "not_configured" | "failed" };

/**
 * Delivers a contact-form message.
 *
 * V1 supports a single integration point: CONTACT_WEBHOOK_URL. Point it at an
 * email service, a Supabase Edge Function, or an automation tool. When it is
 * not configured we report that honestly — the UI never claims a message was
 * sent when it was not.
 */
export async function deliverContactMessage(input: ContactInput): Promise<DeliveryResult> {
  const url = process.env.CONTACT_WEBHOOK_URL;
  if (!url) return { delivered: false, reason: "not_configured" };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(process.env.CONTACT_WEBHOOK_SECRET ? { authorization: `Bearer ${process.env.CONTACT_WEBHOOK_SECRET}` } : {}),
      },
      body: JSON.stringify({ ...input, receivedAt: new Date().toISOString(), source: "ncuda-website" }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok ? { delivered: true } : { delivered: false, reason: "failed" };
  } catch {
    return { delivered: false, reason: "failed" };
  }
}
