import { adminCookieName, supabasePublicKey } from "./config";
import { createBrowserClient } from "@supabase/ssr";

export const createClient = () =>
  createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, supabasePublicKey()!, {
    cookieOptions: { name: adminCookieName },
  });
