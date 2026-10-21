import { getI18n } from "@/lib/i18n/server";
import Link from "next/link";
import { Button } from "ui/button";
import { LanguageSwitcher } from "@/components/language-switcher";

export default async function AuthErrorPage() {
  const { t } = await getI18n();
  return (
    <main className="mx-auto max-w-lg px-6 py-20">
      <div className="mb-4 flex justify-end">
        <LanguageSwitcher />
      </div>
      <div className="admin-panel space-y-6 p-8">
        <p className="admin-eyebrow">{t("Sign in / Link unavailable")}</p>
        <h1 className="admin-title">{t("Sign-in link could not be verified")}</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          {t("The link may have expired or already been used. Sign in again to continue.")}
        </p>
        <Button asChild>
          <Link href="/login">{t("Back to sign in")}</Link>
        </Button>
      </div>
    </main>
  );
}
