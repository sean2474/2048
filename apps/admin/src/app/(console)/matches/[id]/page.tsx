import Link from "next/link";
import type { AdminMatch } from "schema/admin";
import { getI18n } from "@/lib/i18n/server";
import { RefreshButton } from "@/components/refresh-button";
import { Button } from "ui/button";
import { getAdminClient } from "@/lib/supabase/admin";
import { adminTime, listReturn } from "@/lib/investigation";
export default async function MatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const [{ t, locale }, { id }, search, client] = await Promise.all([
    getI18n(),
    params,
    searchParams,
    getAdminClient(),
  ]);
  if (!client) return null;
  let data: AdminMatch | null = null,
    error = "";
  try {
    const result = await client.rpc("admin_match", { p_id: id });
    if (result.error)
      throw new Error(
        result.error.code === "P0002"
          ? "No saved matches found."
          : result.error.code === "22P02"
            ? "Check UUIDs and the date range (maximum 90 days)."
            : result.error.code === "42501"
              ? "Administrator access required"
              : "Records could not be loaded. Check your connection and try again.",
      );
    data = result.data as AdminMatch;
  } catch (failure) {
    error =
      failure instanceof Error
        ? failure.message
        : "Records could not be loaded. Check your connection and try again.";
  }
  return (
    <section className="space-y-6">
      <div className="flex justify-between gap-4">
        <Button asChild variant="outline">
          <Link
            href={listReturn(
              typeof search.returnTo === "string" ? search.returnTo : null,
              "/matches",
            )}
          >
            {t("Back to matches")}
          </Link>
        </Button>
        <RefreshButton />
      </div>
      <h1 className="admin-title">{t("Match detail")}</h1>
      <p className="text-xs break-all text-muted-foreground">{id}</p>
      {error ? (
        <div className="admin-error" role="alert">
          {t(error)}{" "}
          <Link className="underline" href="/operations">
            {t("Check pending storage")}
          </Link>
        </div>
      ) : (
        data && (
          <>
            <dl className="admin-panel grid gap-4 p-6 sm:grid-cols-2">
              {[
                ["Started", adminTime(data.startedAt, locale)],
                ["Ended", adminTime(data.endedAt, locale)],
                ["Mode", t(data.mode)],
                ["Reason", t(data.reason.replaceAll("_", " "))],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="admin-eyebrow mb-2">{t(label)}</dt>
                  <dd className="text-sm">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-muted-foreground">
              {t("Elapsed time includes ready and reconnect waits. Missing telemetry is not zero.")}
            </p>
            <div className="grid gap-4 lg:grid-cols-2">
              {data.participants.map((p) => (
                <article key={p.slot} className="admin-panel p-6 space-y-5">
                  <div className="flex justify-between items-start gap-3">
                    <h2 className="admin-section-title break-words">{p.name}</h2>
                    <span className="admin-badge">{t(p.result)}</span>
                  </div>
                  {p.playerId ? (
                    <Link
                      href={`/players/${p.playerId}`}
                      className="inline-flex min-h-11 items-center text-xs text-primary underline break-all"
                    >
                      {p.playerId}
                    </Link>
                  ) : (
                    <p className="text-xs text-muted-foreground">{t("No linked account")}</p>
                  )}
                  <dl className="grid grid-cols-2 gap-4 text-sm">
                    {[
                      ["Score", p.score.toLocaleString(locale)],
                      ["Max tile", p.maxTile.toLocaleString(locale)],
                      [
                        "Elo",
                        p.ratingBefore === null || p.ratingAfter === null
                          ? t("Not measured")
                          : `${p.ratingBefore} → ${p.ratingAfter} (${(p.ratingDelta ?? 0) > 0 ? "+" : ""}${p.ratingDelta ?? 0})`,
                      ],
                      [
                        "Moves",
                        p.telemetry ? p.telemetry.moves.toLocaleString(locale) : t("Not measured"),
                      ],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-xs text-muted-foreground mb-1">{t(label)}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="space-y-3 border-t pt-4">
                    {(["xblock", "hardblock"] as const).map((kind) => (
                      <p key={kind} className="text-xs">
                        <strong className="block mb-1">
                          {t(
                            kind === "xblock"
                              ? "X charged / sent / received"
                              : "Hard charged / sent / received",
                          )}
                        </strong>
                        {p.telemetry
                          ? `${p.telemetry.charged[kind]} / ${p.telemetry.sent[kind]} / ${p.telemetry.received[kind]}`
                          : t("Not measured")}
                      </p>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </>
        )
      )}
    </section>
  );
}
