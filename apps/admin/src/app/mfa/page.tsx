import { redirect } from "next/navigation";
import { getI18n } from "@/lib/i18n/server";
import { getAdminAccess } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { LanguageSwitcher } from "@/components/language-switcher";
import { SignOut } from "@/components/sign-out";
import { MfaForm } from "@/components/mfa-form";

export const dynamic = "force-dynamic";

export default async function MfaPage() {
  const { t } = await getI18n();
  if (!isSupabaseConfigured()) redirect("/login");
  const { user, mfa } = await getAdminAccess();
  if (!user || user.is_anonymous) redirect("/login");
  if (!mfa) redirect("/");
  return <main className="mx-auto flex min-h-screen max-w-[464px] flex-col justify-center px-5 py-12">
    <div className="mb-6 flex justify-end"><LanguageSwitcher /></div>
    <div className="admin-panel p-6 sm:p-8">
      <p className="admin-eyebrow mb-3">{t("Restricted workspace")}</p>
      <h1 className="admin-title">{t(mfa === "enroll" ? "Set up two-factor authentication" : "Two-factor verification")}</h1>
      <p className="mb-2 mt-3 text-sm leading-6 text-muted-foreground">{t(mfa === "enroll" ? "Administrator access requires an authenticator app. Scan the code, then enter the 6-digit code to finish." : "Enter the 6-digit code from your authenticator app to continue.")}</p>
      <p className="mb-6 break-all text-xs text-muted-foreground">{user.email}</p>
      <MfaForm />
      <div className="mt-6 border-t pt-6"><SignOut /></div>
    </div>
  </main>;
}
