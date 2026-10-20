"use client";

import {
  Bell,
  CalendarClock,
  CheckSquare,
  Download,
  FileText,
  Forward,
  Mail,
  Megaphone,
  Paperclip,
  ScrollText,
  X,
  type LucideIcon,
  Receipt,
} from "lucide-react";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { markNotificationReadAction } from "@/app/dashboard/actions";
import {
  ForwardForm,
  type ForwardOptions,
} from "@/components/portal/ForwardForm";
import type { NotificationType } from "@/lib/domain/types";
import { cn, formatDateTime, formatFileSize } from "@/lib/utils";

export type InboxItem = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  createdAt: string;
  audienceLabel: string;
  senderName: string;
  link?: string;
  read: boolean;
  canForward?: boolean;
  attachments?: Array<{ id: string; filename: string; sizeBytes: number }>;
  forwardInfo?: {
    originalSenderName: string;
    originalSentAt: string;
    forwardedByName: string;
    viaNames: string[];
    note?: string;
  };
};

const ICON: Record<NotificationType, LucideIcon> = {
  meeting_reminder: CalendarClock,
  announcement: Megaphone,
  document_uploaded: FileText,
  action_assigned: CheckSquare,
  action_due: Bell,
  minutes_published: ScrollText,
  message: Mail,
  receipt: Receipt,
};

/**
 * Message-style inbox. Tap a notification to read it; closing the reader
 * marks it read and the unread count drops at once (the server is updated in
 * the background and the sidebar badge follows).
 */
export function NotificationInbox({
  items,
  compact = false,
  forwardOptions = null,
}: {
  items: InboxItem[];
  compact?: boolean;
  forwardOptions?: ForwardOptions | null;
}) {
  // Read = read on the server, or just closed in this session (optimistic).
  const [justRead, setJustRead] = useState<Set<string>>(() => new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [mode, setMode] = useState<"read" | "forward">("read");
  const [, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const isRead = (n: InboxItem) => n.read || justRead.has(n.id);

  const open = items.find((i) => i.id === openId) ?? null;
  const unread = items.filter((i) => !isRead(i)).length;

  const show = (id: string, button: HTMLButtonElement) => {
    openerRef.current = button;
    setOpenId(id);
    setMode("read");
    requestAnimationFrame(() => dialogRef.current?.showModal());
  };

  const onClose = () => {
    const id = openId;
    setOpenId(null);
    openerRef.current?.focus();
    const item = items.find((i) => i.id === id);
    if (id && item && !isRead(item)) {
      setJustRead((prev) => new Set(prev).add(id));
      startTransition(() => markNotificationReadAction(id));
    }
  };

  return (
    <>
      <p className="sr-only" aria-live="polite">
        {unread} unread
      </p>
      {!compact && (
        <p className="mb-4 text-sm text-ink-500">
          <span className="num font-medium text-ink-900">{unread}</span> unread
          · tap a notification to read it
        </p>
      )}

      <ul
        className={cn(
          !compact &&
            "overflow-hidden rounded-[var(--radius-lg)] border border-line bg-white/60",
          "divide-y divide-line",
        )}
      >
        {items.map((n) => {
          const read = isRead(n);
          const Icon = ICON[n.type];
          return (
            <li key={n.id}>
              <button
                type="button"
                onClick={(e) => show(n.id, e.currentTarget)}
                aria-haspopup="dialog"
                className={cn(
                  "group flex w-full gap-4 text-left transition-colors hover:bg-cream/70 focus-visible:bg-cream/70",
                  compact ? "py-3" : "px-5 py-4 sm:px-6",
                  !read && !compact && "bg-gold-100/40",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex shrink-0 items-center justify-center rounded-full transition-colors",
                    compact ? "h-8 w-8" : "h-10 w-10",
                    read ? "bg-cream text-ink-500" : "bg-forest-900 text-paper",
                  )}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.6} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        "truncate",
                        read ? "text-ink-700" : "font-semibold text-ink-900",
                      )}
                    >
                      {n.title}
                    </span>
                    {n.attachments && n.attachments.length > 0 && (
                      <Paperclip
                        className="h-3.5 w-3.5 shrink-0 text-ink-500"
                        aria-label="Has attachments"
                        role="img"
                      />
                    )}
                    {!read && (
                      <span
                        className="h-2 w-2 shrink-0 rounded-full bg-earth-600"
                        aria-label="Unread"
                        role="img"
                      />
                    )}
                  </span>
                  {!compact && (
                    <span className="mt-0.5 block truncate text-sm text-ink-500">
                      {n.body}
                    </span>
                  )}
                  <span className="mt-1 block text-xs text-ink-500">
                    {n.forwardInfo
                      ? `Forwarded by ${n.senderName} · from ${n.forwardInfo.originalSenderName}`
                      : n.senderName}{" "}
                    · {formatDateTime(n.createdAt)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <dialog
        ref={dialogRef}
        onClose={onClose}
        aria-labelledby="notification-title"
        className="m-auto w-[min(36rem,calc(100vw-2rem))] rounded-[var(--radius-lg)] border border-line bg-paper p-0 text-ink-900 shadow-[var(--shadow-lift)] backdrop:bg-forest-950/50 backdrop:backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close(); // tap outside to close
        }}
      >
        {open && (
          <div className="flex max-h-[85dvh] flex-col">
            <header className="flex items-start gap-4 border-b border-line px-6 py-5">
              <div className="min-w-0 flex-1">
                <p className="eyebrow text-[0.625rem] text-earth-700">
                  {open.type === "message" ? "Message" : "Notification"}
                </p>
                <h2
                  id="notification-title"
                  className="mt-2 font-display text-2xl leading-snug text-forest-900"
                >
                  {open.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                className="-mr-2 rounded-full p-2 text-ink-500 hover:bg-cream hover:text-forest-900"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </header>
            {mode === "forward" && forwardOptions ? (
              <ForwardForm
                notificationId={open.id}
                title={open.title}
                options={forwardOptions}
                onBack={() => setMode("read")}
                onDone={() => dialogRef.current?.close()}
              />
            ) : (
              <div className="overflow-y-auto px-6 py-5">
                {open.forwardInfo && (
                  <div className="mb-5 rounded-[var(--radius-md)] border border-gold-500/40 bg-gold-100/50 px-4 py-3 text-sm">
                    <p className="flex items-center gap-2 font-medium text-ink-900">
                      <Forward className="h-4 w-4 text-gold-700" aria-hidden />
                      Forwarded by {open.forwardInfo.forwardedByName}
                    </p>
                    <p className="mt-1 text-xs text-ink-500">
                      To {open.audienceLabel} · {formatDateTime(open.createdAt)}
                      {open.forwardInfo.viaNames.length > 0 &&
                        ` · earlier forwarded by ${open.forwardInfo.viaNames.join(", ")}`}
                    </p>
                    {open.forwardInfo.note && (
                      <p className="mt-3 whitespace-pre-line border-l-2 border-gold-500 pl-3 text-ink-700">
                        <span className="sr-only">
                          Note from {open.forwardInfo.forwardedByName}:{" "}
                        </span>
                        {open.forwardInfo.note}
                      </p>
                    )}
                  </div>
                )}
                {open.forwardInfo && (
                  <p className="eyebrow mb-2 text-[0.625rem] text-ink-500">
                    Original message
                  </p>
                )}
                <dl className="grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt className="text-ink-500">From</dt>
                  <dd className="text-ink-900">
                    {open.forwardInfo
                      ? open.forwardInfo.originalSenderName
                      : open.senderName}
                  </dd>
                  {!open.forwardInfo && (
                    <>
                      <dt className="text-ink-500">To</dt>
                      <dd className="text-ink-900">{open.audienceLabel}</dd>
                    </>
                  )}
                  <dt className="text-ink-500">Sent</dt>
                  <dd className="text-ink-900">
                    {formatDateTime(
                      open.forwardInfo
                        ? open.forwardInfo.originalSentAt
                        : open.createdAt,
                    )}
                  </dd>
                </dl>
                <p className="mt-5 whitespace-pre-line leading-relaxed text-ink-700">
                  {open.body}
                </p>
                {open.attachments && open.attachments.length > 0 && (
                  <div className="mt-6 border-t border-line pt-4">
                    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">
                      <Paperclip className="h-3.5 w-3.5" aria-hidden />
                      {open.attachments.length === 1
                        ? "1 attachment"
                        : `${open.attachments.length} attachments`}
                    </p>
                    <ul className="mt-3 grid gap-2">
                      {open.attachments.map((a) => (
                        <li key={a.id}>
                          <a
                            href={`/dashboard/public-relations/${a.id}/download`}
                            className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-line bg-white/60 px-3 py-2.5 text-sm hover:border-forest-700/50"
                          >
                            <span className="min-w-0 truncate font-medium text-forest-900">
                              {a.filename}
                            </span>
                            <span className="flex shrink-0 items-center gap-2 text-xs text-ink-500">
                              {formatFileSize(a.sizeBytes)}
                              <Download
                                className="h-4 w-4 text-earth-700"
                                aria-hidden
                              />
                              <span className="sr-only">Download</span>
                            </span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            {mode === "read" && (
              <footer className="flex items-center justify-between gap-3 border-t border-line px-6 py-4">
                {open.link ? (
                  <Link
                    href={open.link}
                    onClick={() => dialogRef.current?.close()}
                    className="text-sm font-medium text-earth-700 underline-offset-4 hover:underline"
                  >
                    Go to related page →
                  </Link>
                ) : (
                  <span />
                )}
                <div className="flex items-center gap-2">
                  {open.canForward && forwardOptions && (
                    <button
                      type="button"
                      onClick={() => setMode("forward")}
                      className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-line-strong px-4 py-2.5 text-sm font-medium text-forest-900 hover:border-forest-800"
                    >
                      <Forward className="h-4 w-4" aria-hidden />
                      Forward
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => dialogRef.current?.close()}
                    className="rounded-[var(--radius-sm)] bg-forest-800 px-5 py-2.5 text-sm font-medium text-paper hover:bg-forest-900"
                  >
                    Done
                  </button>
                </div>
              </footer>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}

