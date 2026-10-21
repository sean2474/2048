import { getI18n } from "@/lib/i18n/server";
import { LoginForm } from "@/components/login-form";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { LanguageSwitcher } from "@/components/language-switcher";

export default async function LoginPage() {
  const { t } = await getI18n();
  return (
    <main className="mx-auto flex min-h-screen max-w-[464px] flex-col justify-center px-5 py-12">
      <div className="mb-6 flex justify-end">
        <LanguageSwitcher />
      </div>
      <div className="mb-8 flex items-center justify-center gap-3">
        <span className="grid size-11 place-items-center rounded-xl bg-primary text-xs font-bold text-primary-foreground shadow-sm">
          2048
        </span>
        <span className="text-xl font-bold tracking-tight">
          duo <span className="font-normal text-muted-foreground">{t("/ admin")}</span>
        </span>
      </div>
      <div className="admin-panel p-6 sm:p-8">
        <p className="admin-eyebrow mb-3">{t("Restricted workspace")}</p>
        <h1 className="admin-title">{t("Welcome back.")}</h1>
        <p className="mb-8 mt-3 text-sm leading-6 text-muted-foreground">
          {t("Sign in with your administrator account.")}
        </p>
        {isSupabaseConfigured() ? (
          <LoginForm />
        ) : (
          <p role="alert" className="admin-error">
            {t("Administration is unavailable until the app is configured.")}
          </p>
        )}
      </div>
      <p className="mt-6 text-center text-xs text-muted-foreground">
        {t("2048 Duo · Game administration")}
      </p>
    </main>
  );
}
