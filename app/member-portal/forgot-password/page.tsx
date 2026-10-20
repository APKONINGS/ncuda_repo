import type { Metadata } from "next";
import Link from "next/link";
import { PortalAuthFrame } from "@/components/portal/PortalAuthFrame";
import { ResetForm } from "@/components/portal/ResetForm";

export const metadata: Metadata = {
  title: "Reset password",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <PortalAuthFrame>
      <Link href="/member-portal" className="text-sm text-ink-500 hover:text-forest-900">
        ← Back to sign in
      </Link>
      <h1 className="display mt-8 text-[2.75rem] text-forest-900">
        Reset your <span className="display-italic text-earth-700">password</span>
      </h1>
      <p className="mt-4 text-ink-700">
        Enter your email to get a reset link.
      </p>
      <div className="mt-10">
        <ResetForm />
      </div>
    </PortalAuthFrame>
  );
}
