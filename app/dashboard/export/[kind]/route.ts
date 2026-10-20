import { getActor } from "@/lib/auth/actor";
import { buildExport, EXPORT_KINDS, type ExportKind } from "@/lib/portal/exports";

/** Spreadsheet (CSV) downloads: only what the person can already see, and each is audited. */
export async function GET(req: Request, ctx: RouteContext<"/dashboard/export/[kind]">) {
  const actor = await getActor();
  if (!actor) return new Response("Sign in required.", { status: 401 });

  const { kind } = await ctx.params;
  const file = (EXPORT_KINDS as readonly string[]).includes(kind) ? buildExport(actor, kind as ExportKind, new URL(req.url).searchParams) : null;
  if (!file) return new Response("Nothing to export.", { status: 404 });

  return new Response(file.body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${file.filename}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
