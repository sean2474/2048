import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, supabasePublicKey } from "./config";
export async function updateSession(request: NextRequest) {
  // Layout-only hint for account-dependent loading geometry. It grants no access.
  request.headers.set("x-2048-loading-member", "0");
  let response = NextResponse.next({ request });
  if (
    !isSupabaseConfigured() ||
    !request.cookies.getAll().some((cookie) => cookie.name.startsWith("sb-"))
  )
    return response;
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, supabasePublicKey()!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookies) {
        cookies.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  request.headers.set("x-2048-loading-member", user && !user.is_anonymous ? "1" : "0");
  const result = NextResponse.next({ request });
  response.cookies.getAll().forEach((cookie) => result.cookies.set(cookie));
  return result;
}
