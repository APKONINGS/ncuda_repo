import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic gate only: sends visitors without a session cookie to the
 * sign-in page. Real verification (signature, expiry, active membership,
 * permissions) happens on the server in every portal page and action, and
 * ultimately in the database via Row Level Security.
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.has("ncuda_session")) {
    const url = new URL("/member-portal", request.url);
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
