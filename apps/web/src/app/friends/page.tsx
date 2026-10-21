import { Suspense } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { getUser } from "@/lib/supabase/account";
import { FriendDirectory } from "@/components/widget/friend-directory";
import { Button } from "@/components/ui/button";
import { FriendDirectorySkeleton, FriendsSkeleton } from "@/components/widget/records-skeleton";
export default async function FriendsPage() {
  const [{ t }, user] = await Promise.all([getI18n(), getUser()]);
  return (
    <main className="mx-auto max-w-[1120px] space-y-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="flex items-center gap-3 text-3xl font-extrabold">
          <Users aria-hidden="true" />
          {t("Friends & messages")}
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {t("Find players, chat with friends, and watch their live matches.")}
        </p>
      </div>
      {user && !user.is_anonymous ? (
        <Suspense fallback={<FriendDirectorySkeleton label={t("Loading friends…")} />}>
          <FriendDirectory loading={<FriendsSkeleton label={t("Loading friends…")} />} />
        </Suspense>
      ) : (
        <section className="space-y-4 rounded-2xl border bg-card p-6">
          <p>{t("Sign in to add friends, send messages, and spectate.")}</p>
          <Button asChild>
            <Link href="/login">{t("Login")}</Link>
          </Button>
        </section>
      )}
    </main>
  );
}
