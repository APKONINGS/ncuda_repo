import { markAllNotificationsReadAction } from "@/app/dashboard/actions";
import { ComposeMessage } from "@/components/portal/ComposeMessage";
import { NotificationInbox } from "@/components/portal/NotificationInbox";
import { EmptyState, PageHeader, Panel } from "@/components/portal/ui";
import { requireActor } from "@/lib/auth/actor";
import { listNotifications, messagingOptions, sentMessages } from "@/lib/portal/queries";
import { formatDateTime, plural } from "@/lib/utils";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage({ searchParams }: PageProps<"/dashboard/notifications">) {
  const actor = await requireActor();
  const items = listNotifications(actor);
  const unread = items.filter((n) => !n.read).length;
  const compose = messagingOptions(actor);
  const sent = compose ? sentMessages(actor) : [];
  const params = await searchParams;
  const view = compose && params.view === "compose" ? "compose" : compose && params.view === "sent" ? "sent" : "inbox";

  const tab = (key: string, label: string) => (
    <a
      href={key === "inbox" ? "/dashboard/notifications" : `/dashboard/notifications?view=${key}`}
      aria-current={view === key ? "page" : undefined}
      className={`inline-flex rounded-full px-4 py-2 text-sm ${view === key ? "bg-forest-900 text-paper" : "border border-line text-ink-700 hover:bg-cream"}`}
    >
      {label}
    </a>
  );

  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow="Notifications"
        title="Notifications"
        actions={
          view === "inbox" && unread > 0 ? (
            <form action={markAllNotificationsReadAction}>
              <button type="submit" className="rounded-[var(--radius-sm)] border border-line-strong px-4 py-2.5 text-sm font-medium text-forest-900 hover:border-forest-800">
                Mark all as read
              </button>
            </form>
          ) : undefined
        }
      />

      {compose && (
        <nav aria-label="Notification views" className="flex flex-wrap gap-2">
          {tab("inbox", "Inbox")}
          {tab("compose", "Send a message")}
          {tab("sent", "Sent")}
        </nav>
      )}

      {view === "inbox" &&
        (items.length === 0 ? (
          <Panel>
            <EmptyState title="No notifications">You’re all caught up.</EmptyState>
          </Panel>
        ) : (
          <NotificationInbox
            items={items.map((n) => ({
              id: n.id,
              type: n.type,
              title: n.title,
              body: n.body,
              createdAt: n.createdAt,
              audienceLabel: n.audienceLabel,
              senderName: n.senderName,
              link: n.link,
              read: n.read,
              canForward: n.canForward,
              forwardInfo: n.forwardInfo,
              attachments: n.attachments,
            }))}
            forwardOptions={compose}
          />
        ))}

      {view === "compose" && compose && (
        <Panel title="Send a message" tone="cream">
          <ComposeMessage scopes={compose.scopes} roles={compose.roles} />
        </Panel>
      )}

      {view === "sent" && (
        <Panel title="Sent messages" bodyClassName="p-0 sm:p-0">
          {sent.length === 0 ? (
            <EmptyState compact title="You haven’t sent any messages yet" />
          ) : (
            <ul className="divide-y divide-line">
              {sent.map((m) => (
                <li key={m.id} className="px-5 py-4 sm:px-6">
                  <p className="font-medium text-ink-900">
                    {m.forward && <span className="mr-2 rounded-full bg-gold-100 px-2 py-0.5 align-middle text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-gold-700">Forwarded</span>}
                    {m.title}
                  </p>
                  {m.originalSenderName && <p className="mt-0.5 text-xs text-ink-500">Originally from {m.originalSenderName}</p>}
                  <p className="mt-1 text-xs text-ink-500">
                    To {m.audienceLabel} · {plural(m.recipientCount, "recipient")} · {formatDateTime(m.createdAt)}
                  </p>
                  <p className="mt-2 line-clamp-2 text-sm text-ink-700">{m.body}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
    </div>
  );
}
