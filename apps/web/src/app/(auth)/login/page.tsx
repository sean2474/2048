import { getI18n } from "@/lib/i18n/server";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "@/components/widget/login-form";
import { LoginBtn } from "@/components/ui/login-button";
import Link from "next/link";
import { PageHeading } from "@/components/widget/page-heading";
import { ArrowLeft } from "lucide-react";
export default async function Page() {
  const { t } = await getI18n();
  if (!isSupabaseConfigured()) redirect("/");
  const { data } = await (await createClient()).auth.getUser();
  if (data.user && !data.user.is_anonymous) redirect("/");
  return (
    <main className="mx-auto w-full max-w-[480px] px-4 py-6 sm:py-10">
      <Link
        href="/"
        className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {t("Back to game")}
      </Link>
      <div className="mb-6">
        <PageHeading
          icon="profile"
          title={t("Log in")}
          description={t("Log in to save your games and play ranked.")}
        />
      </div>
      <section aria-label={t("Log in")} className="space-y-6 game-panel bg-card p-6 sm:p-8">
        <LoginForm />
        <LoginBtn type="google" />
      </section>
      <p className="mt-4 text-center text-xs leading-5 text-muted-foreground">
        <Link
          href="/play/online"
          className="inline-flex min-h-11 items-center font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          {t("Play as a guest")}
        </Link>
      </p>
    </main>
  );
}
