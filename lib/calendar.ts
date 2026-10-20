import type { Meeting } from "@/lib/domain/types";

/*
 * "Add to calendar" for meetings: a standard calendar file (.ics, RFC 5545)
 * that Apple Calendar, Outlook and phones open, plus links that open a filled-in
 * event in Google Calendar and Outlook on the web. Meetings without an end time
 * are given two hours.
 */

const DEFAULT_LENGTH_MS = 2 * 60 * 60 * 1000;

function endOf(meeting: Meeting) {
  return meeting.endsAt ?? new Date(new Date(meeting.startsAt).getTime() + DEFAULT_LENGTH_MS).toISOString();
}

/** 2026-10-15T17:00:00.000Z → 20261015T170000Z */
const compact = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Escapes text for an .ics property value. */
const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Folds a content line to at most 75 octets, as the format requires. */
function fold(line: string) {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest, "utf8") > 75) {
    let cut = 74;
    while (Buffer.byteLength(rest.slice(0, cut), "utf8") > 74) cut--;
    out.push(rest.slice(0, cut));
    rest = " " + rest.slice(cut);
  }
  out.push(rest);
  return out.join("\r\n");
}

/** What appears in the event's notes: the agenda and a link back to the meeting. */
export function meetingDescription(meeting: Meeting, pageUrl: string) {
  const agenda = meeting.agenda.length ? `Agenda:\n${meeting.agenda.map((a, i) => `${i + 1}. ${a}`).join("\n")}\n\n` : "";
  return `${agenda}Details, minutes and documents: ${pageUrl}`;
}

/** The meeting as a calendar file. A cancelled meeting is marked cancelled, so calendars that already have it update. */
export function meetingIcs(meeting: Meeting, pageUrl: string) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//NCUDA//Member Portal//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${meeting.id}@ncuda-portal`,
    `DTSTAMP:${compact(new Date().toISOString())}`,
    `DTSTART:${compact(meeting.startsAt)}`,
    `DTEND:${compact(endOf(meeting))}`,
    `SUMMARY:${icsText(meeting.title)}`,
    `LOCATION:${icsText(meeting.location)}`,
    `DESCRIPTION:${icsText(meetingDescription(meeting, pageUrl))}`,
    `URL:${pageUrl}`,
    `STATUS:${meeting.status === "cancelled" ? "CANCELLED" : "CONFIRMED"}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsText(meeting.title)}`,
    "TRIGGER:-PT1H",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** Opens a filled-in event in Google Calendar. */
export function googleCalendarUrl(meeting: Meeting, pageUrl: string) {
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: meeting.title,
    dates: `${compact(meeting.startsAt)}/${compact(endOf(meeting))}`,
    details: meetingDescription(meeting, pageUrl),
    location: meeting.location,
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/** Opens a filled-in event in Outlook on the web. */
export function outlookCalendarUrl(meeting: Meeting, pageUrl: string) {
  const q = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: meeting.title,
    startdt: meeting.startsAt,
    enddt: endOf(meeting),
    location: meeting.location,
    body: meetingDescription(meeting, pageUrl),
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${q.toString()}`;
}
