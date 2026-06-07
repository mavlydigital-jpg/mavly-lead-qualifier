import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE = "mavly_auth";

// Web Crypto works in both the edge (middleware) and node runtimes.
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function middleware(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  // No password set → leave app open (lets you deploy before configuring it).
  if (!password) return NextResponse.next();

  const cookie = req.cookies.get(COOKIE)?.value;
  const expected = await sha256Hex(password);
  if (cookie && cookie === expected) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("from", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Protect everything except the login page, the auth endpoints, Next
  // internals, and the brand assets the login screen needs to render.
  matcher: ["/((?!login|api/login|api/logout|_next/static|_next/image|favicon.ico|icon.svg|logo.svg).*)"],
};
