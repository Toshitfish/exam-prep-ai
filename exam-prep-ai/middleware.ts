import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const isSignInPageRequest = req.nextUrl.pathname === "/api/auth/signin";
  const acceptsHtml = req.headers.get("accept")?.includes("text/html") ?? false;

  // Only redirect real browser page navigations for the signin page.
  // Do not touch JSON/API fetches used by next-auth client endpoints.
  if (isSignInPageRequest && req.method === "GET" && acceptsHtml) {
    const redirectUrl = new URL("/", req.url);
    const error = req.nextUrl.searchParams.get("error");
    if (error) {
      redirectUrl.searchParams.set("authError", error);
    }
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/auth/signin"],
};
