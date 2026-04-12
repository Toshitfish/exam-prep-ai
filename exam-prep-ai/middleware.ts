import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/api/auth/signin") && req.method === "GET") {
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
  matcher: ["/api/auth/:path*"],
};
