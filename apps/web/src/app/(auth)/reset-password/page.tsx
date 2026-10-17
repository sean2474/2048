import { redirect } from "next/navigation";
import { AuthForm } from "@/components/widget/auth-form";
import { PageHeading } from "@/components/widget/page-heading";
import { getI18n } from "@/lib/i18n/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata = { robots: { index: false, follow: false } };

export default async function Page() {
  const { t } = await getI18n();
  if (!isSupabaseConfigured()) redirect("/");
  return <main className="mx-auto w-full max-w-[480px] px-4 py-6 sm:py-10">
    <div className="mb-6"><PageHeading icon="profile" title={t("Choose a new password")} description={t("Use a password you haven’t used on this account before.")} /></div>
    <section aria-label={t("Choose a new password")} className="game-panel bg-card p-6 sm:p-8"><AuthForm mode="reset" /></section>
  </main>;
}
