"use client";

import Link from "next/link";
import { adminTime } from "@/lib/investigation";
import { useEffect, useState } from "react";
import type { Feedback } from "schema/feedback";
import { useI18n } from "ui/i18n";
import { Button } from "ui/button";
import { createClient } from "@/lib/supabase/client";

const PAGE_SIZE = 25;

export default function FeedbackPage() {
  const { t, locale } = useI18n();
  const [offset, setOffset] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [rows, setRows] = useState<Feedback[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true); setError(false); setRows([]);
    void (async () => {
      try {
        const { data, count, error: failure } = await createClient().from("feedback")
          .select("id,reporter_id,category,subject,message,created_at", { count: "exact" })
          .order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + PAGE_SIZE - 1);
        if (failure) throw failure;
        if (active) { setRows(data as Feedback[]); setTotal(count ?? 0); }
      } catch { if (active) setError(true); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [offset, attempt]);

  return <section aria-labelledby="feedback-heading" className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="admin-eyebrow mb-2">{t("Player feedback")}</p><h1 id="feedback-heading" className="admin-title">{t("Bugs & feedback")}</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">{t("Reports from players and guests, newest first.")}</p></div><Button variant="outline" disabled={loading} onClick={() => setAttempt(value => value + 1)}>{t("Refresh")}</Button></div>
    {loading ? <p role="status" className="admin-state">{t("Loading reports…")}</p> : error ? <div role="alert" className="admin-error flex flex-wrap items-center justify-between gap-4"><p>{t("Reports could not be loaded. Please try again.")}</p><Button variant="outline" onClick={() => setAttempt(value => value + 1)}>{t("Try again")}</Button></div> : <>
      <p role="status" className="text-xs text-muted-foreground">{t("Reports: {count}", { count: total.toLocaleString(locale) })}</p>
      {!rows.length ? <div className="admin-state"><p className="font-semibold text-foreground">{t("No reports yet")}</p><p className="mt-2">{t("Submitted bug reports and suggestions will appear here.")}</p></div> : <ul className="space-y-4">{rows.map(report => <li key={report.id} className="admin-panel overflow-hidden p-5 sm:p-6">
        <div className="mb-3 flex flex-wrap items-center gap-3"><span className={`admin-badge ${report.category === "bug" ? "admin-badge-warm" : "admin-badge-positive"}`}>{t(report.category === "bug" ? "Bug report" : "Suggestion")}</span><time dateTime={report.created_at} className="text-xs text-muted-foreground">{adminTime(report.created_at, locale)}</time>{report.reporter_id ? <Link href={`/players/${report.reporter_id}`} className="inline-flex min-h-11 items-center rounded-lg px-2 text-xs font-semibold text-primary hover:underline sm:ml-auto">{t("View reporter")}</Link> : <span className="text-xs text-muted-foreground sm:ml-auto">{t("Guest or deleted account")}</span>}</div>
        <h2 className="break-words text-base font-bold [overflow-wrap:anywhere]">{report.subject}</h2><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 [overflow-wrap:anywhere]">{report.message}</p>
      </li>)}</ul>}
      {total > PAGE_SIZE && <nav aria-label={t("Report pages")} className="flex items-center justify-between gap-4"><Button variant="outline" disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value - PAGE_SIZE))}>{t("Previous")}</Button><span className="text-xs tabular-nums text-muted-foreground">{Math.floor(offset / PAGE_SIZE) + 1} / {Math.ceil(total / PAGE_SIZE)}</span><Button variant="outline" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset(value => value + PAGE_SIZE)}>{t("Next")}</Button></nav>}
    </>}
  </section>;
}
