import type { Metadata } from "next";
import { passwordStatus } from "@/lib/auth/demo-credentials";
import { redirect } from "next/navigation";
import { PortalAuthFrame } from "@/components/portal/PortalAuthFrame";
import { SignInForm } from "@/components/portal/SignInForm";
import { getActor } from "@/lib/auth/actor";
import { authMode } from "@/lib/auth/config";
import { DEMO_PASSWORD } from "@/lib/demo/fixtures";
import { db, syncStore } from "@/lib/demo/store";

export const metadata: Metadata = {
  title: "Member Portal",
  description: "Sign in to the NCUDA Member Portal. Member accounts are created by authorized NCUDA officers.",
  robots: { index: false, follow: true },
};

/** Demo sign-in buttons: name, post, and the chapter (with its region) they are grouped under. */
function demoAccountList() {
  const d = db();
  const chapterOf = (memberId: string) => d.chapters.find((c) => c.id === d.affiliations.find((a) => a.memberId === memberId && a.endedAt === null)?.chapterId);
  return d.accounts
    .filter((a) => passwordStatus(a.memberId) === "shared")
    .map((a) => {
      const member = d.members.find((m) => m.id === a.memberId);
      const chapter = chapterOf(a.memberId);
      const region = d.regions.find((r) => r.id === chapter?.regionId);
      return {
        email: a.email,
        label: a.label,
        name: member?.fullName ?? a.label,
        number: member?.memberNumber ?? "",
        group: chapter ? `${chapter.name}${region ? ` · ${region.name}` : ""}` : "Not in a chapter",
      };
    })
    .sort((x, y) => x.group.localeCompare(y.group, "en", { numeric: true }) || x.number.localeCompare(y.number, "en", { numeric: true }))
    .map(({ email, label, name, group }) => ({ email, label, name, group }));
}

export default async function MemberPortalPage({ searchParams }: PageProps<"/member-portal">) {
  if (await getActor()) redirect("/dashboard");
  await syncStore();
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const signedOut = params["signed-out"] === "1";
  const demo = authMode() === "demo";

  return (
    <PortalAuthFrame>
      <p className="eyebrow text-earth-700">NCUDA Member Portal</p>
      <h1 className="display mt-4 text-[3.25rem] text-forest-900">
        Sign <span className="display-italic text-earth-700">in</span>
      </h1>
      <p className="mt-3 text-ink-700">Use the account issued to you by your chapter.</p>

      {signedOut && (
        <p role="status" className="mt-6 rounded-[var(--radius-sm)] bg-forest-100 px-4 py-3 text-sm text-forest-900">
          You have been signed out securely.
        </p>
      )}

      <div className="mt-10">
        <SignInForm
          next={next}
          demoAccounts={demo ? demoAccountList() : undefined}
          demoPassword={demo ? DEMO_PASSWORD : undefined}
        />
      </div>

      <div className="mt-10 flex gap-3 border-t border-line pt-6 text-sm leading-relaxed text-ink-500">
        <svg aria-hidden viewBox="0 0 16 16" className="mt-0.5 h-4 w-4 shrink-0 text-forest-700" fill="none">
          <rect x="2.5" y="7" width="11" height="7.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
          <path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.3" />
        </svg>
        <p>
          No account? Ask your chapter&apos;s officers.
        </p>
      </div>
    </PortalAuthFrame>
  );
}
