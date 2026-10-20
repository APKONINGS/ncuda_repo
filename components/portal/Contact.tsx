import { cn } from "@/lib/utils";

/**
 * A person's phone and email as tap-to-call / tap-to-email links (shown to
 * officers only). `plain` renders text without links, for use inside a link;
 * `inline` continues the current line (" · phone · email").
 */
export function Contact({
  contact,
  className,
  plain = false,
  inline = false,
}: {
  contact: { email: string; phone: string | null } | null | undefined;
  className?: string;
  plain?: boolean;
  inline?: boolean;
}) {
  if (!contact) return null;
  const linkClass = "text-earth-700 underline-offset-4 hover:underline";
  return (
    <span className={cn(inline ? "inline" : "block", "text-xs font-normal text-ink-500", className)}>
      {inline && " · "}
      {plain ? (
        <span className="num">{contact.phone ?? "No phone"}</span>
      ) : contact.phone ? (
        <a href={`tel:${contact.phone.replace(/\s+/g, "")}`} className={cn("num", linkClass)}>
          {contact.phone}
        </a>
      ) : (
        <span>No phone</span>
      )}
      {" · "}
      {plain ? (
        <span className="break-all">{contact.email}</span>
      ) : (
        <a href={`mailto:${contact.email}`} className={cn("break-all", linkClass)}>
          {contact.email}
        </a>
      )}
    </span>
  );
}
