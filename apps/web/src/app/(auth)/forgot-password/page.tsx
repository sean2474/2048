import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AuthForm } from "@/components/widget/auth-form";
import { PageHeading } from "@/components/widget/page-heading";
import { getI18n } from "@/lib/i18n/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default async function Page() {
  const { t } = await getI18n();
  if (!isSupabaseConfigured()) redirect("/");
  return <main className="mx-auto w-full max-w-[480px] px-4 py-6 sm:py-10">
    <Link href="/login" className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4"><ArrowLeft aria-hidden="true" className="size-4" />{t("Return to login")}</Link>
    <div className="mb-6"><PageHeading icon="profile" title={t("Reset password")} description={t("We’ll email you a link to choose a new password.")} /></div>
    <section aria-label={t("Reset password")} className="game-panel bg-card p-6 sm:p-8"><AuthForm mode="forgot" /></section>
  </main>;
}
