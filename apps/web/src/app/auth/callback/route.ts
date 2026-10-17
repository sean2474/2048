import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function GET(request: Request) {
  const url = new URL(request.url), code = url.searchParams.get("code");
  if (url.searchParams.get("type") === "recovery") {
    const destination = new URL("/reset-password", url.origin);
    // A distinct query name prevents the shared browser client from consuming this code before the recovery form.
    if (code && code.length <= 4096) destination.searchParams.set("recovery_code", code);
    return new NextResponse(null, { status: 307, headers: {
      Location: `${destination.pathname}${destination.search}`, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
    } });
  }
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/", url.origin));
  }
  return NextResponse.redirect(new URL("/auth/error", url.origin));
}
