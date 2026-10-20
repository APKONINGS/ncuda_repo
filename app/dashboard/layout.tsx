import type { Metadata } from "next";
import { signOut } from "@/app/dashboard/actions";
import { PortalSidebar, type NavSection } from "@/components/portal/PortalSidebar";
import Link from "next/link";
import { requireActor } from "@/lib/auth/actor";
import { passwordStatus } from "@/lib/auth/demo-credentials";
import { hasCommittees } from "@/lib/portal/committees";
import { sendDueReminders } from "@/lib/portal/meetings";
import { authMode } from "@/lib/auth/config";
import { hasAnywhere } from "@/lib/permissions/engine";
import { roleName } from "@/lib/permissions/roles";
import { chapterName, listNotifications } from "@/lib/portal/queries";
import { initials } from "@/lib/utils";

export const metadata: Metadata = {
  title: { default: "Dashboard", template: "%s — NCUDA Member Portal" },
  robots: { index: false, follow: false },
};

export default async function PortalLayout({ children }: LayoutProps<"/dashboard">) {
  const actor = await requireActor({ allowInactive: true });
  // Testing mode has no scheduler: meeting reminders that have come due go out as pages load.
  if (authMode() === "demo") sendDueReminders();
  // Inactive (registration unpaid): no notifications, only the pages they may still use.
  const unread = actor.inactive ? 0 : listNotifications(actor).filter((n) => !n.read).length;
  const demo = authMode() === "demo";

  const admin: NavSection["items"] = [];
  if (hasAnywhere(actor, "CREATE_CHAPTER") || hasAnywhere(actor, "CREATE_REGION"))
    admin.push({ href: "/dashboard/chapters", label: hasAnywhere(actor, "CREATE_REGION") ? "Regions & chapters" : "Chapters", icon: "chapters" });
  if (hasAnywhere(actor, "VIEW_MEMBER")) admin.push({ href: "/dashboard/members", label: "Members", icon: "members" });
  if (!actor.inactive && (hasAnywhere(actor, "ASSIGN_ROLE") || hasAnywhere(actor, "VIEW_MEMBER"))) {
    admin.push({ href: "/dashboard/roles", label: "Roles & access", icon: "roles" });
  }
  if (hasAnywhere(actor, "VIEW_AUDIT_LOG")) admin.push({ href: "/dashboard/audit-log", label: "Audit log", icon: "audit" });
  // Registration: the President General (national), Financial Secretaries (their desk), coordinators (their region, read only).
  const regionalRecords = actor.grants.some((g) => g.permission === "VIEW_CONTRIBUTIONS" && g.scope.level === "region");
  if (hasAnywhere(actor, "MANAGE_REGISTRATION") || hasAnywhere(actor, "CREATE_MEMBER") || regionalRecords) admin.push({ href: "/dashboard/registration", label: "Registration", icon: "registration" });

  const sections: NavSection[] = [
    {
      title: "My NCUDA",
      items: actor.inactive
        ? [
            { href: "/dashboard", label: "Overview", icon: "overview" },
            { href: "/dashboard/finances", label: "Finances", icon: "contributions" },
            { href: "/dashboard/profile", label: "My profile", icon: "profile" },
          ]
        : [
            { href: "/dashboard", label: "Overview", icon: "overview" },
            { href: "/dashboard/meetings", label: "Meetings", icon: "meetings" },
            { href: "/dashboard/attendance", label: "Attendance", icon: "attendance" },
            { href: "/dashboard/finances", label: "Finances", icon: "contributions" },
            { href: "/dashboard/public-relations", label: "Public Relations", icon: "documents" },
            ...(hasCommittees(actor) ? [{ href: "/dashboard/committees", label: "Committees", icon: "committees" }] : []),
            { href: "/dashboard/notifications", label: "Notifications", icon: "notifications", badge: unread },
            { href: "/dashboard/profile", label: "My profile", icon: "profile" },
          ],
    },
    ...(admin.length ? [{ title: "Administration", items: admin }] : []),
  ];

  const primaryRole = actor.roles[0]?.role.key ?? "MEMBER";

  return (
    <div className="min-h-dvh bg-paper">
      <a href="#portal-main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[60] focus:rounded focus:bg-forest-900 focus:px-4 focus:py-2 focus:text-paper">
        Skip to content
      </a>
      <div className="print:hidden">
        <PortalSidebar sections={sections} demo={demo} />
      </div>

      <div className="min-w-0 lg:pl-[17rem] print:pl-0">
        <header className="sticky top-16 z-20 border-b print:hidden border-line bg-paper/90 backdrop-blur-md lg:top-0">
          <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-8 lg:h-20 lg:px-10">
            <div className="flex min-w-0 items-center gap-3 text-sm">
              {demo && (
                <span className="shrink-0 rounded-full border border-gold-500/60 bg-gold-100 px-2.5 py-1 text-[0.625rem] font-bold uppercase tracking-[0.14em] text-gold-700">
                  Demo
                </span>
              )}
              <span className="truncate text-ink-500">
                <span className="hidden sm:inline">Chapter: </span>
                <span className="font-medium text-ink-900">{chapterName(actor.chapterId)}</span>
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-medium leading-tight text-ink-900">{actor.member.fullName}</p>
                <p className="text-xs leading-tight text-ink-500">{roleName(primaryRole)}</p>
              </div>
              <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-full bg-forest-800 text-sm font-semibold text-paper">
                {initials(actor.member.fullName)}
              </span>
              <form action={signOut}>
                <button type="submit" className="rounded-[var(--radius-sm)] border border-line-strong px-3 py-2 text-sm text-ink-700 transition-colors hover:border-forest-800 hover:text-forest-900">
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </header>
        <main id="portal-main" data-portal className="px-4 pb-24 pt-8 sm:px-8 lg:px-10 lg:pt-10 print:p-0">
          <div className="mx-auto min-w-0 max-w-[76rem] [&>*]:min-w-0">
            <p className="mb-6 hidden border-b border-line pb-3 text-xs text-ink-500 print:block">
              NCUDA — Ngwo Cultural and Development Association · Member Portal · printed by {actor.member.fullName} on{" "}
              {new Date().toLocaleString("en-GB", { timeZone: "Africa/Lagos", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })} WAT
            </p>
            {actor.inactive && (
              <p role="note" className="mb-6 rounded-[var(--radius-md)] border border-earth-500/40 print:hidden bg-earth-100/60 px-4 py-3 text-sm text-ink-900">
                <span className="font-semibold">Your account is inactive</span> until your Registration {actor.inactive.year} is paid.{" "}
                <Link href="/dashboard" className="font-medium text-earth-700 underline underline-offset-4">
                  See what to pay
                </Link>
                .
              </p>
            )}
            {passwordStatus(actor.member.id) === "temporary" && (
              <p role="note" className="mb-6 rounded-[var(--radius-md)] border border-gold-500/50 print:hidden bg-gold-100/60 px-4 py-3 text-sm text-ink-900">
                You are signed in with a temporary password that someone else set for you.{" "}
                <Link href="/dashboard/profile#password" className="font-medium text-earth-700 underline underline-offset-4">
                  Choose your own password
                </Link>
                .
              </p>
            )}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
