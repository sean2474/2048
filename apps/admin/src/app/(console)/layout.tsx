
import { getI18n } from "@/lib/i18n/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { AdminNav } from "@/components/admin-nav";
import { SignOut } from "@/components/sign-out";
import { Button } from "ui/button";
import { LanguageSwitcher } from "@/components/language-switcher";

export const dynamic = "force-dynamic";

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const { t } = await getI18n();
  if (!isSupabaseConfigured()) return <main className="mx-auto max-w-lg px-6 py-20"><div className="mb-4 flex justify-end"><LanguageSwitcher /></div><div className="admin-panel space-y-4 p-8"><p className="admin-eyebrow">{t("Duo administration")}</p><h1 className="admin-title">{t("Administration unavailable")}</h1><p className="text-sm leading-6 text-muted-foreground">{t("The administrator application has not been configured.")}</p></div></main>;
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user || user.is_anonymous) redirect("/login");
  const { data: allowed, error } = await client.rpc("is_game_admin");
  if (error || allowed !== true) return <main className="mx-auto max-w-lg px-6 py-20"><div className="mb-4 flex justify-end"><LanguageSwitcher /></div><div className="admin-panel space-y-6 p-8">
    <p className="admin-eyebrow">{t("Duo administration · Restricted access")}</p>
    <h1 className="admin-title">{t(error ? "Access could not be verified" : "Administrator access required")}</h1>
    <p role="alert" className="text-sm leading-6 text-muted-foreground">{t(error ? "Please try again shortly." : "This account does not have access to game administration.")}</p>
    <div className="flex items-center gap-4"><Button asChild variant="outline"><Link href="/">{t("Try again")}</Link></Button><SignOut /></div>
  </div></main>;
  return <div className="min-h-screen md:grid md:grid-cols-[224px_minmax(0,1fr)]">
    <aside className="border-b bg-card p-4 md:sticky md:top-0 md:flex md:h-screen md:flex-col md:border-b-0 md:border-r md:p-6">
      <Link href="/" className="mb-4 flex min-h-11 items-center gap-3 md:mb-10"><span className="grid size-11 place-items-center rounded-xl bg-primary text-xs font-bold tracking-tight text-primary-foreground shadow-sm">2048</span><span><span className="block text-lg font-bold tracking-tight">duo</span><span className="admin-eyebrow text-[9px]">{t("Administration")}</span></span></Link>
      <p className="admin-eyebrow mb-3 hidden px-4 md:block">{t("Workspace")}</p>
      <AdminNav />
      <div className="mt-auto hidden border-t pt-6 md:block"><p className="text-xs font-semibold">{t("Game operations")}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{t("Balance insights and player administration.")}</p></div>
    </aside>
    <div className="min-w-0">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b bg-card/80 px-4 py-4 sm:px-8">
        <p className="admin-eyebrow hidden lg:block">{t("2048 Duo / Operations")}</p>
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-3 sm:gap-4"><span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-sm font-bold text-secondary-foreground">{user.email?.slice(0, 1).toUpperCase() || "A"}</span><div className="min-w-0"><p className="max-w-40 truncate text-xs font-semibold sm:max-w-xs" title={user.email}>{user.email}</p><p className="mt-1 text-[10px] text-muted-foreground">{t("Administrator")}</p></div><LanguageSwitcher /><SignOut /></div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:p-8 lg:p-10">{children}</main>
    </div>
  </div>;
}
