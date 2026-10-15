import { getI18n } from "@/lib/i18n/server";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SignupForm } from "@/components/widget/signup-form";
import { LoginBtn } from "@/components/ui/login-button";
import Link from "next/link";
import { PageHeading } from "@/components/widget/page-heading";
import { ArrowLeft } from "lucide-react";
export default async function Page() {
  const { t } = await getI18n();
  if (!isSupabaseConfigured()) redirect("/");
  return <main className="mx-auto w-full max-w-[480px] px-4 py-6 sm:py-10">
    <Link href="/" className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4"><ArrowLeft aria-hidden="true" className="size-4" />{t("Back to game")}</Link>
    <div className="mb-6"><PageHeading icon="crown" title={t("Create an account")} /></div>
    <section aria-label={t("Create an account")} className="space-y-6 game-panel bg-card p-6 sm:p-8"><SignupForm /><LoginBtn type="google" /></section>
  </main>;
}
