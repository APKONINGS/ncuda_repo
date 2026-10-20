"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { buildActor } from "@/lib/auth/actor";
import { authMode, sessionSecret } from "@/lib/auth/config";
import { clearFailures, isThrottled, recordFailure, verifyDemoCredentials } from "@/lib/auth/demo-credentials";
import { writeSession } from "@/lib/auth/session";
import { db, syncStore } from "@/lib/demo/store";
import { recordAudit } from "@/lib/portal/audit";

export type SignInState = { error?: string; identifier?: string };

const schema = z.object({
  identifier: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(200),
  next: z.string().optional(),
});

const GENERIC = "The email/username or password is incorrect.";

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  await syncStore();
  const parsed = schema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) return { error: "Enter your email or username and your password." };
  const { identifier, password, next } = parsed.data;

  if (authMode() !== "demo") {
    return { error: "Supabase sign-in is not connected yet in this build.", identifier };
  }
  if (!sessionSecret()) {
    return { error: "Sign-in is unavailable: the server has no SESSION_SECRET configured.", identifier };
  }

  // Accept an email address or the username part of it.
  const email = identifier.includes("@")
    ? identifier
    : (db().accounts.find((a) => a.email.split("@")[0].toLowerCase() === identifier.toLowerCase())?.email ??
      db().members.find((m) => m.email.split("@")[0].toLowerCase() === identifier.toLowerCase())?.email ??
      identifier);

  const key = email.toLowerCase();
  if (isThrottled(key)) {
    return { error: "Too many unsuccessful attempts. Please wait 15 minutes and try again.", identifier };
  }

  const memberId = verifyDemoCredentials(email, password);
  if (!memberId) {
    recordFailure(key);
    return { error: GENERIC, identifier };
  }

  const actor = buildActor(memberId);
  if (!actor) {
    return { error: "This account is not active. Please contact your chapter officers.", identifier };
  }

  clearFailures(key);
  await writeSession(memberId);
  recordAudit(actor, {
    action: "LOGIN",
    entityType: "session",
    entityId: memberId,
    chapterId: actor.chapterId,
    summary: `${actor.member.fullName} signed in`,
  });

  redirect(next && next.startsWith("/dashboard") && !next.startsWith("//") ? next : "/dashboard");
}

export type ResetState = { status: "idle" | "unavailable" };

export async function requestPasswordReset(): Promise<ResetState> {
  // With Supabase Auth this calls auth.resetPasswordForEmail() and always
  // returns the same neutral message, whether or not the account exists.
  return { status: "unavailable" };
}
