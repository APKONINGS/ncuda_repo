import { z } from "zod";

/**
 * Phone numbers: digits, with an optional leading + and spaces or hyphens
 * for readability (e.g. +237 6 77 12 34 56). No letters; at least 6 digits.
 */
export const PHONE_MESSAGE = "Use digits only (a leading + is allowed).";
export const PHONE_TOO_SHORT = "Enter at least 6 digits.";
const PHONE_RE = /^\+?[\d\s-]+$/;

/** Keeps only what a phone number may contain: + (first character only), digits, spaces and hyphens. */
export function cleanPhone(value: string) {
  const kept = value.replace(/[^\d\s+-]/g, "");
  return kept.startsWith("+") ? "+" + kept.slice(1).replace(/\+/g, "") : kept.replace(/\+/g, "");
}

/** An optional phone number ("" when left blank). */
export const phoneSchema = z
  .string()
  .trim()
  .max(40)
  .superRefine((v, ctx) => {
    if (v === "") return;
    if (!PHONE_RE.test(v)) ctx.addIssue({ code: "custom", message: PHONE_MESSAGE });
    else if (v.replace(/\D/g, "").length < 6) ctx.addIssue({ code: "custom", message: PHONE_TOO_SHORT });
  });
