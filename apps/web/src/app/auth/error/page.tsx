import { getI18n } from "@/lib/i18n/server";
import Link from "next/link";
import { GameEmblem } from "@/components/widget/game-emblem";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
export default async function AuthError() {
  const { t } = await getI18n();
  return (
    <main className="mx-auto max-w-[520px] px-4 py-8 sm:py-12">
      <section className="space-y-5 game-panel bg-card p-6 shadow-sm sm:p-8">
        <GameEmblem kind="friend" className="size-16" />
        <h1 className="text-3xl font-extrabold tracking-tight">{t("Sign-in link expired")}</h1>
        <p className="text-sm leading-7 text-muted-foreground">
          {t(
            "Try signing in again. For email confirmation, open the link in the same browser where you created your account.",
          )}
        </p>
        <Button asChild className="w-full">
          <Link href="/login">
            <ArrowLeft aria-hidden="true" />
            {t("Return to login")}
          </Link>
        </Button>
      </section>
    </main>
  );
}
