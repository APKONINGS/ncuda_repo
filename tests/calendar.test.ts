import { describe, expect, it } from "vitest";
import { googleCalendarUrl, meetingIcs, outlookCalendarUrl } from "@/lib/calendar";
import type { Meeting } from "@/lib/domain/types";

const meeting: Meeting = {
  id: "mtg_1",
  title: "Chapter meeting; budget, plans",
  startsAt: "2026-11-07T14:00:00.000Z",
  location: "Town hall, Ngwo",
  scope: { level: "chapter", chapterId: "ch_a1" },
  status: "scheduled",
  agenda: ["Opening prayer", "Budget for 2027 — a long item that makes this line wrap past seventy-five octets"],
  createdBy: "mem_sec",
};
const url = "https://example.org/dashboard/meetings/mtg_1";

describe("add to calendar", () => {
  it("builds a valid calendar file in UTC, two hours long when no end is set", () => {
    const ics = meetingIcs(meeting, url);
    expect(ics).toContain("DTSTART:20261107T140000Z\r\n");
    expect(ics).toContain("DTEND:20261107T160000Z\r\n");
    expect(ics).toContain("SUMMARY:Chapter meeting\\; budget\\, plans\r\n");
    expect(ics).toContain("STATUS:CONFIRMED");
    for (const line of ics.split("\r\n")) expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    // Unfolding gives back the agenda.
    expect(ics.split("\r\n ").join("")).toContain("2. Budget for 2027 — a long item that makes this line wrap past seventy-five octets");
  });

  it("marks a cancelled meeting cancelled and uses the real end time", () => {
    const ics = meetingIcs({ ...meeting, status: "cancelled", endsAt: "2026-11-07T15:30:00.000Z" }, url);
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics).toContain("DTEND:20261107T153000Z");
  });

  it("links to Google Calendar and Outlook with the details filled in", () => {
    const g = new URL(googleCalendarUrl(meeting, url));
    expect(g.searchParams.get("dates")).toBe("20261107T140000Z/20261107T160000Z");
    expect(g.searchParams.get("location")).toBe("Town hall, Ngwo");
    expect(g.searchParams.get("details")).toContain(url);
    const o = new URL(outlookCalendarUrl(meeting, url));
    expect(o.searchParams.get("subject")).toBe(meeting.title);
    expect(o.searchParams.get("startdt")).toBe(meeting.startsAt);
  });
});
