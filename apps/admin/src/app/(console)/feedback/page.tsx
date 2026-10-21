import Link from "next/link";
import { adminTime } from "@/lib/investigation";
import type { Feedback } from "schema/feedback";
import { getI18n } from "@/lib/i18n/server";
import { RefreshButton } from "@/components/refresh-button";
import { Button } from "ui/button";
import { getAdminClient } from "@/lib/supabase/admin";

const PAGE_SIZE = 25;

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ t, locale }, params, client] = await Promise.all([
    getI18n(),
    searchParams,
    getAdminClient(),
  ]);
  if (!client) return null;
  const rawOffset = Number(params.offset ?? 0);
  const offset = Number.isSafeInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0;
  let rows: Feedback[] = [],
    total = 0,
    error = false;
  try {
    const result = await client
      .from("feedback")
      .select("id,reporter_id,category,subject,message,created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (result.error) throw result.error;
    rows = result.data as Feedback[];
    total = result.count ?? 0;
  } catch {
    error = true;
  }
  return (
    <section aria-labelledby="feedback-heading" className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="admin-eyebrow mb-2">{t("Player feedback")}</p>
          <h1 id="feedback-heading" className="admin-title">
            {t("Bugs & feedback")}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {t("Reports from players and guests, newest first.")}
          </p>
        </div>
        <RefreshButton />
      </div>
      {error ? (
        <div role="alert" className="admin-error flex flex-wrap items-center justify-between gap-4">
          <p>{t("Reports could not be loaded. Please try again.")}</p>
          <RefreshButton />
        </div>
      ) : (
        <>
          <p role="status" className="text-xs text-muted-foreground">
            {t("Reports: {count}", { count: total.toLocaleString(locale) })}
          </p>
          {!rows.length ? (
            <div className="admin-state">
              <p className="font-semibold text-foreground">{t("No reports yet")}</p>
              <p className="mt-2">{t("Submitted bug reports and suggestions will appear here.")}</p>
            </div>
          ) : (
            <ul className="space-y-4">
              {rows.map((report) => (
                <li key={report.id} className="admin-panel overflow-hidden p-5 sm:p-6">
                  <div className="mb-3 flex flex-wrap items-center gap-3">
                    <span
                      className={`admin-badge ${report.category === "bug" ? "admin-badge-warm" : "admin-badge-positive"}`}
                    >
                      {t(report.category === "bug" ? "Bug report" : "Suggestion")}
                    </span>
                    <time dateTime={report.created_at} className="text-xs text-muted-foreground">
                      {adminTime(report.created_at, locale)}
                    </time>
                    {report.reporter_id ? (
                      <Link
                        href={`/players/${report.reporter_id}`}
                        className="inline-flex min-h-11 items-center rounded-lg px-2 text-xs font-semibold text-primary hover:underline sm:ml-auto"
                      >
                        {t("View reporter")}
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground sm:ml-auto">
                        {t("Guest or deleted account")}
                      </span>
                    )}
                  </div>
                  <h2 className="break-words text-base font-bold [overflow-wrap:anywhere]">
                    {report.subject}
                  </h2>
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 [overflow-wrap:anywhere]">
                    {report.message}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {total > PAGE_SIZE && (
            <nav aria-label={t("Report pages")} className="flex items-center justify-between gap-4">
              <Button asChild variant="outline">
                <Link
                  href={`/feedback?offset=${Math.max(0, offset - PAGE_SIZE)}`}
                  aria-disabled={offset === 0}
                >
                  {t("Previous")}
                </Link>
              </Button>
              <span className="text-xs tabular-nums text-muted-foreground">
                {Math.floor(offset / PAGE_SIZE) + 1} / {Math.ceil(total / PAGE_SIZE)}
              </span>
              <Button asChild variant="outline">
                <Link
                  href={`/feedback?offset=${offset + PAGE_SIZE < total ? offset + PAGE_SIZE : offset}`}
                  aria-disabled={offset + PAGE_SIZE >= total}
                >
                  {t("Next")}
                </Link>
              </Button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
