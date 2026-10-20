"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Sticky index of activity categories with scroll-spy highlighting. */
export function CategoryIndex({
  items,
}: {
  items: Array<{ slug: string; title: string }>;
}) {
  const [active, setActive] = useState(items[0]?.slug);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-30% 0px -60% 0px" },
    );
    items.forEach((i) => {
      const el = document.getElementById(i.slug);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav
      aria-label="Activity areas"
      className="sticky top-[4.75rem] z-30 border-y border-line bg-paper/92 backdrop-blur-md"
    >
      <div className="container-site">
        <ul className="-mx-2 flex gap-1 overflow-x-auto py-3 [scrollbar-width:none]">
          {items.map((item) => (
            <li key={item.slug} className="shrink-0">
              <a
                href={`#${item.slug}`}
                aria-current={active === item.slug ? "true" : undefined}
                className={cn(
                  "inline-flex items-center rounded-full px-4 py-2 text-sm transition-colors",
                  active === item.slug
                    ? "bg-forest-900 text-paper"
                    : "text-ink-700 hover:bg-cream hover:text-forest-900",
                )}
              >
                {item.title}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
