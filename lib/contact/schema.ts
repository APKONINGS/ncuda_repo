import { z } from "zod";
import { phoneSchema } from "@/lib/phone";

export const contactSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name.").max(120),
  email: z.email("Please enter a valid email address.").trim().max(200),
  phone: phoneSchema.optional(),
  subject: z.string().trim().min(3, "Please add a short subject.").max(160),
  message: z.string().trim().min(10, "Please write a little more (at least 10 characters).").max(5000),
});

export type ContactInput = z.infer<typeof contactSchema>;
export type ContactField = keyof ContactInput;

export type ContactState =
  | { status: "idle" }
  | { status: "invalid"; errors: Partial<Record<ContactField, string>>; values: Partial<ContactInput> }
  | { status: "sent" }
  | { status: "not_configured"; values: Partial<ContactInput> }
  | { status: "error"; values: Partial<ContactInput> };
