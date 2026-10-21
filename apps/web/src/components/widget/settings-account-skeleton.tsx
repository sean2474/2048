import "server-only";
import { Skeleton } from "@/components/ui/skeleton";
import type { getRequestI18n } from "@/lib/i18n/server";

export function SettingsAccountSkeleton({
  t,
}: {
  t: Awaited<ReturnType<typeof getRequestI18n>>["t"];
}) {
  return (
    <>
      <section
        data-loading-panel="profile"
        role="status"
        aria-busy="true"
        aria-label={t("Loading profile…")}
        className="game-panel bg-card p-5 sm:p-6"
      >
        <Skeleton className="h-9 w-40" />
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {t("Your nickname is shown to other players.")}
        </p>
        <div className="mt-5 space-y-4">
          <div className="grid gap-2">
            <p className="text-sm font-semibold">{t("Nickname")}</p>
            <Skeleton className="h-[50px] w-full rounded-xl" />
            <div className="flex justify-between gap-3 text-xs text-muted-foreground">
              <span>{t("Use 1–32 characters. Spaces at the ends are removed.")}</span>
              <Skeleton className="h-4 w-10 shrink-0" />
            </div>
          </div>
          <div className="grid gap-2">
            <p className="text-sm font-semibold">{t("Email")}</p>
            <Skeleton className="h-[50px] w-full rounded-xl" />
            <p className="text-xs leading-5 text-muted-foreground">
              {t("Your sign-in email cannot be changed here.")}
            </p>
          </div>
          <Skeleton className="h-11 w-36" />
        </div>
        <div className="mt-6 border-t pt-5">
          <Skeleton className="h-11 w-28" />
        </div>
      </section>
      <section
        data-loading-panel="delete-account"
        className="rounded-2xl border border-destructive/25 bg-card p-5 sm:p-6"
      >
        <Skeleton className="h-6 w-40" />
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          {t("Permanently remove your account and personal game data. This cannot be undone.")}
        </p>
        <Skeleton className="mt-4 h-11 w-44" />
      </section>
    </>
  );
}
