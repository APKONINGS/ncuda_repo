"use server";

import { deliverContactMessage } from "@/lib/contact/deliver";
import {
  contactSchema,
  type ContactField,
  type ContactState,
} from "@/lib/contact/schema";

export async function submitContact(
  _prev: ContactState,
  formData: FormData,
): Promise<ContactState> {
  // Honeypot: real visitors never see or fill this field.
  if (String(formData.get("website") ?? "").length > 0)
    return { status: "sent" };

  const raw = {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    subject: String(formData.get("subject") ?? ""),
    message: String(formData.get("message") ?? ""),
  };

  const parsed = contactSchema.safeParse(raw);
  if (!parsed.success) {
    const errors: Partial<Record<ContactField, string>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as ContactField;
      errors[key] ??= issue.message;
    }
    return { status: "invalid", errors, values: raw };
  }

  const result = await deliverContactMessage(parsed.data);
  if (result.delivered) return { status: "sent" };
  return result.reason === "not_configured"
    ? { status: "not_configured", values: raw }
    : { status: "error", values: raw };
}
