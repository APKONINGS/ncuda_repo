export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/** All dates display in Cameroon time (West Africa Time, UTC+1). */
export const ORG_TIME_ZONE = "Africa/Douala";
export const ORG_TIME_ZONE_LABEL = "WAT";

/**
 * The calendar date (YYYY-MM-DD) of a moment in West Africa Time (UTC+1, no
 * daylight saving) — the date people see. Using the UTC date instead would be
 * a day behind between midnight and 1 am.
 */
export const watDate = (at: string | number | Date) => new Date(new Date(at).getTime() + 3_600_000).toISOString().slice(0, 10);
/** Today's date in West Africa Time. */
export const watToday = () => watDate(Date.now());
const tz = { timeZone: ORG_TIME_ZONE } as const;

const dateFmt = new Intl.DateTimeFormat("en-GB", { ...tz, day: "numeric", month: "short", year: "numeric" });
const dateLongFmt = new Intl.DateTimeFormat("en-GB", {
  ...tz,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("en-GB", { ...tz, hour: "2-digit", minute: "2-digit" });
const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  ...tz,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export const formatDate = (iso: string) => dateFmt.format(new Date(iso));
export const formatDateLong = (iso: string) => dateLongFmt.format(new Date(iso));
export const formatTime = (iso: string) => timeFmt.format(new Date(iso));
export const formatDateTime = (iso: string) => dateTimeFmt.format(new Date(iso));

/** Amounts are stored as integer minor units; XAF has no minor unit. */
export function formatMoney(amount: number, currency = "XAF") {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "XAF" ? 0 : 2,
  }).format(amount);
}

export function initials(name: string) {
  return name
    .replace(/^Demo\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

const monthFmt = new Intl.DateTimeFormat("en-GB", { ...tz, month: "short" });
const dayFmt = new Intl.DateTimeFormat("en-GB", { ...tz, day: "numeric" });
export const formatMonthShort = (iso: string) => monthFmt.format(new Date(iso));
export const formatDayOfMonth = (iso: string) => dayFmt.format(new Date(iso));

export const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

/** Human-readable file size (never shows "0 KB"). */
export const formatFileSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
