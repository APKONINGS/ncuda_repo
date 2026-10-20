import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "light" | "outline-light" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "group/btn relative inline-flex items-center justify-center gap-2.5 font-medium tracking-[0.01em] transition-[background-color,color,border-color,box-shadow,transform] duration-300 ease-[var(--ease-soft)] active:translate-y-px disabled:pointer-events-none disabled:opacity-50 rounded-[var(--radius-sm)] whitespace-nowrap";

const variants: Record<Variant, string> = {
  primary: "bg-earth-600 text-paper hover:bg-earth-700 shadow-[inset_0_-2px_0_rgb(0_0_0/0.15)]",
  secondary: "bg-forest-800 text-paper hover:bg-forest-900",
  ghost: "text-forest-900 hover:bg-forest-100",
  light: "bg-paper text-forest-900 hover:bg-cream",
  "outline-light": "border border-paper/35 text-paper hover:border-paper hover:bg-paper/5",
  danger: "bg-danger text-paper hover:brightness-110",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm",
  md: "h-11 px-5 text-[0.9375rem]",
  lg: "h-13 px-7 text-base",
};

export function buttonClasses(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

export function Arrow({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 12"
      className={cn(
        "h-3 w-5 transition-transform duration-300 ease-[var(--ease-soft)] group-hover/btn:translate-x-1",
        className,
      )}
      fill="none"
    >
      <path d="M0 6h18M13 1l5 5-5 5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function ButtonLink({
  href,
  variant,
  size,
  className,
  children,
  arrow,
  ...rest
}: Omit<ComponentProps<typeof Link>, "className"> & {
  variant?: Variant;
  size?: Size;
  className?: string;
  arrow?: boolean;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClasses(variant, size, className)} {...rest}>
      {children}
      {arrow && <Arrow />}
    </Link>
  );
}

export function Button({
  variant,
  size,
  className,
  children,
  ...rest
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return (
    <button className={buttonClasses(variant, size, className)} {...rest}>
      {children}
    </button>
  );
}
