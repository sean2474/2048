import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
export function middleware(request: NextRequest) {
  // Overwrite inbound values: this is only a loading-layout hint, never identity.
  request.headers.set("x-2048-route", request.nextUrl.pathname + request.nextUrl.search);
  return updateSession(request);
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.ico|icons/|profile-icons/).*)"] };
