"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { WeaveBand } from "@/components/brand/Motifs";
import { nav } from "@/lib/content/site";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  const pathname = usePathname();
  // Remember which page the menu was opened on; navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (next: boolean | ((v: boolean) => boolean)) =>
    setOpenOn(
      (typeof next === "function" ? next(open) : next) ? pathname : null,
    );
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenOn(null);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-50 transition-[background-color,box-shadow,backdrop-filter] duration-500",
          open
            ? "bg-paper shadow-[0_1px_0_var(--color-line)]"
            : scrolled
              ? "bg-paper/92 shadow-[0_1px_0_var(--color-line)] backdrop-blur-md"
              : "bg-paper",
        )}
      >
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-[60] focus:rounded focus:bg-forest-900 focus:px-4 focus:py-2 focus:text-paper"
        >
          Skip to content
        </a>
        <div className="container-site flex h-[4.75rem] items-center justify-between gap-6">
          <Link href="/" aria-label="NCUDA home" className="rounded-sm">
            <Logo />
          </Link>

          <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={cn(
                  "group relative px-4 py-2 text-[0.9375rem] transition-colors",
                  isActive(item.href)
                    ? "text-forest-900"
                    : "text-ink-700 hover:text-forest-900",
                )}
              >
                {item.label}
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-x-4 -bottom-0.5 h-px origin-left bg-earth-600 transition-transform duration-500 ease-[var(--ease-soft)]",
                    isActive(item.href)
                      ? "scale-x-100"
                      : "scale-x-0 group-hover:scale-x-100",
                  )}
                />
              </Link>
            ))}
            <span aria-hidden className="mx-3 h-5 w-px bg-line-strong" />
            <Link
              href="/member-portal"
              className="group inline-flex items-center gap-2.5 rounded-[var(--radius-sm)] border border-forest-800/25 px-4 py-2 text-[0.9375rem] font-medium text-forest-900 transition-colors hover:border-forest-800 hover:bg-forest-900 hover:text-paper"
            >
              <LockGlyph />
              Member Portal
            </Link>
          </nav>

          <button
            type="button"
            className="relative -mr-2 inline-flex h-11 w-11 items-center justify-center rounded-md text-forest-900 lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            <span className="relative block h-3 w-6">
              <span
                className={cn(
                  "absolute left-0 top-0 h-px w-6 bg-current transition-transform duration-300",
                  open && "translate-y-1.5 rotate-45",
                )}
              />
              <span
                className={cn(
                  "absolute bottom-0 left-0 h-px w-6 bg-current transition-transform duration-300",
                  open && "-translate-y-1.5 -rotate-45",
                )}
              />
            </span>
          </button>
        </div>
      </header>

      {/* Mobile menu — rendered outside <header>: the header's backdrop-filter
          would otherwise become the containing block for this fixed panel
          and collapse it to zero height. */}
      <div
        id="mobile-menu"
        hidden={!open}
        className="fixed inset-x-0 bottom-0 top-[4.75rem] z-40 overflow-y-auto bg-paper lg:hidden"
      >
        <nav
          aria-label="Mobile"
          className="container-site flex min-h-full flex-col pb-10 pt-6"
        >
          <ul className="divide-y divide-line border-y border-line">
            {nav.map((item, i) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className="flex items-baseline justify-between py-5"
                >
                  <span className="display text-4xl text-forest-900">
                    {item.label}
                  </span>
                  <span className="num text-xs text-ink-500">0{i + 1}</span>
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href="/member-portal"
            className="mt-8 inline-flex items-center justify-center gap-3 rounded-[var(--radius-sm)] bg-forest-900 px-5 py-4 font-medium text-paper"
          >
            <LockGlyph />
            Member Portal
          </Link>
          <p className="mt-4 text-center text-sm text-ink-500">
            Accounts are created by authorized officers.
          </p>
          <WeaveBand className="mt-auto pt-10 text-earth-600/70" height={16} />
        </nav>
      </div>
    </>
  );
}

function LockGlyph() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
      <rect
        x="2.5"
        y="7"
        width="11"
        height="7.5"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M5 7V5a3 3 0 0 1 6 0v2"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}
