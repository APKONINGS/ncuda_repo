"use client";

import {
  BadgeCheck,
  Handshake,
  Bell,
  Building2,
  CalendarDays,
  ClipboardCheck,
  FileText,
  History,
  LayoutGrid,
  ShieldCheck,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoMark } from "@/components/brand/Logo";
import { ContourField } from "@/components/brand/Motifs";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  overview: LayoutGrid,
  meetings: CalendarDays,
  attendance: ClipboardCheck,
  contributions: Wallet,
  documents: FileText,
  notifications: Bell,
  profile: UserRound,
  members: Users,
  chapters: Building2,
  roles: ShieldCheck,
  audit: History,
  registration: BadgeCheck,
  committees: Handshake,
};

export type NavSection = { title: string; items: Array<{ href: string; label: string; icon: string; badge?: number }> };

export function PortalSidebar({ sections, demo }: { sections: NavSection[]; demo: boolean }) {
  const pathname = usePathname();
  // Remember which page the menu was opened on; navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (next: boolean | ((v: boolean) => boolean)) =>
    setOpenOn((typeof next === "function" ? next(open) : next) ? pathname : null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenOn(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const isActive = (href: string) => (href === "/dashboard" ? pathname === href : pathname.startsWith(href));

  const nav = (
    <nav aria-label="Portal" className="flex flex-col gap-8">
      {sections.map((section) => (
        <div key={section.title}>
          <p className="eyebrow px-3 text-[0.625rem] text-paper/40">{section.title}</p>
          <ul className="mt-3 grid gap-0.5">
            {section.items.map((item) => {
              const Icon = ICONS[item.icon] ?? LayoutGrid;
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 text-[0.9375rem] transition-colors",
                      active ? "bg-paper/10 text-paper" : "text-paper/65 hover:bg-paper/5 hover:text-paper",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 bg-gold-500 transition-opacity",
                        active ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <Icon aria-hidden className="h-[1.1rem] w-[1.1rem]" strokeWidth={1.5} />
                    <span className="flex-1">{item.label}</span>
                    {item.badge ? (
                      <span className="num rounded-full bg-earth-600 px-1.5 py-0.5 text-[0.6875rem] font-semibold leading-none text-paper">
                        {item.badge}
                        <span className="sr-only"> unread</span>
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div data-surface="dark" className="on-dark sticky top-0 z-40 flex h-16 items-center justify-between bg-forest-950 px-4 text-paper lg:hidden">
        <Link href="/dashboard" className="flex items-center gap-2.5 rounded-sm">
          <LogoMark className="h-8 w-8 text-paper" />
          <span className="font-display text-lg tracking-[0.06em]">NCUDA</span>
          <span className="text-xs text-paper/50">Portal</span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="portal-nav-drawer"
          className="inline-flex h-11 items-center gap-2 rounded-md px-3 text-sm"
        >
          {open ? "Close" : "Menu"}
        </button>
      </div>

      {open && (
        <div id="portal-nav-drawer" data-surface="dark" className="on-dark fixed inset-x-0 bottom-0 top-16 z-40 overflow-y-auto bg-forest-950 px-4 py-6 text-paper lg:hidden">
          {nav}
        </div>
      )}

      {/* Desktop sidebar */}
      <aside
        data-surface="dark"
        className="on-dark fixed inset-y-0 left-0 z-30 hidden w-[17rem] flex-col overflow-hidden bg-forest-950 text-paper lg:flex"
      >
        <ContourField className="pointer-events-none absolute -bottom-10 left-0 h-72 w-full text-forest-700/60" lines={9} seed={6} />
        <div className="relative flex h-20 items-center gap-3 px-6">
          <Link href="/dashboard" className="flex items-center gap-3 rounded-sm">
            <LogoMark className="h-9 w-9 text-paper" />
            <span className="leading-none">
              <span className="block font-display text-xl tracking-[0.06em]">NCUDA</span>
              <span className="mt-1 block text-[0.625rem] uppercase tracking-[0.18em] text-paper/50">Member Portal</span>
            </span>
          </Link>
        </div>
        <div className="relative flex-1 overflow-y-auto px-3 pb-6 pt-4">{nav}</div>
        <div className="relative border-t border-paper/10 px-6 py-4 text-xs text-paper/45">
          {demo ? "Demo mode — fictional data" : "Secure session"}
          <Link href="/" className="mt-1 block text-paper/60 hover:text-paper">
            ← Public website
          </Link>
        </div>
      </aside>
    </>
  );
}
