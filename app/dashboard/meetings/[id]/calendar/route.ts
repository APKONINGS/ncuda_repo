import { getActor } from "@/lib/auth/actor";
import { meetingIcs } from "@/lib/calendar";
import { site } from "@/lib/content/site";
import { getMeeting } from "@/lib/portal/queries";

/** The meeting as a calendar file (.ics), for those who can see the meeting. */
export async function GET(_req: Request, ctx: RouteContext<"/dashboard/meetings/[id]/calendar">) {
  const actor = await getActor();
  if (!actor) return new Response("Sign in required.", { status: 401 });

  const { id } = await ctx.params;
  const data = getMeeting(actor, id);
  // Same response for "missing" and "not permitted": no information leaks.
  if (!data) return new Response("Meeting not found.", { status: 404 });

  const { meeting } = data;
  const filename = `${meeting.title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "meeting"}.ics`;
  return new Response(meetingIcs(meeting, `${site.url}/dashboard/meetings/${meeting.id}`), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
