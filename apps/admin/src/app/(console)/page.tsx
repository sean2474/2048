"use client";

import { useI18n } from "ui/i18n";

import { OperationsNotice } from "@/components/operations-notice";
import { adminTime } from "@/lib/investigation";
import { useEffect, useState } from "react";
import type { AdminMode, AdminOverview } from "schema/admin";
import { createClient } from "@/lib/supabase/client";
import { Button } from "ui/button";

export default function AdminPage() {
  const { t, locale } = useI18n();
  const number = (value: number | null) => value === null ? t("Not measured") : value.toLocaleString(locale, { maximumFractionDigits: 1 });
  const [days, setDays] = useState(30);
  const [mode, setMode] = useState<AdminMode>("all");
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setData(null);
    async function load() {
      try {
        const { data: result, error: failure } = await createClient().rpc("admin_overview", { p_days: days, p_mode: mode });
        if (failure) throw failure;
        if (active) setData(result as AdminOverview);
      } catch { if (active) setError("Statistics could not be loaded. Check your connection and administrator access, then try again."); }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [days, mode, reload]);

  return <section className="space-y-6" aria-labelledby="overview-heading">
    <div className="space-y-6">
      <div><p className="admin-eyebrow mb-2">{t("Game health")}</p><h1 id="overview-heading" className="admin-title">{t("Balance overview")}</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">{t("Match activity, attack usage, and the shape of competition.")}</p></div>
      <div className="admin-panel flex flex-wrap gap-4 items-end p-4 sm:px-6">
        <label className="grid gap-2 text-xs font-semibold">{t("Period")}<select className="admin-field min-w-36" value={days} onChange={event => setDays(Number(event.target.value))}><option value={7}>{t("Last 7 days")}</option><option value={30}>{t("Last 30 days")}</option><option value={90}>{t("Last 90 days")}</option></select></label>
        <label className="grid gap-2 text-xs font-semibold">{t("Mode")}<select className="admin-field min-w-32" value={mode} onChange={event => setMode(event.target.value as AdminMode)}><option value="all">{t("All modes")}</option><option value="casual">{t("Casual")}</option><option value="ranked">{t("Ranked")}</option><option value="friend">{t("Friend")}</option></select></label>
        <span className="mb-3 hidden text-xs text-muted-foreground xl:block">{t("Completed matches only")}</span>
        <div className="sm:ml-auto">
        <Button variant="outline" disabled={loading} onClick={() => setReload(value => value + 1)}>{t("Refresh")}</Button>
        </div>
      </div>
    </div>
    <OperationsNotice />
    {error ? <p role="alert" className="admin-error">{t(error)}</p> : loading ? <p role="status" className="admin-state">{t("Loading statistics…")}</p> : data && <>
      <p className="text-xs leading-6 text-muted-foreground">{data.periodStart && data.periodEnd && `${adminTime(data.periodStart, locale)} – ${adminTime(data.periodEnd, locale)}`}<br />{t("The first and last dates are partial days. Participating accounts counts unique linked accounts in completed matches, not all registrations. Elapsed time includes ready and reconnect waits.")}</p>
      <dl className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          ["Completed matches", number(data.totals.matches)], ["Ranked matches", number(data.totals.rankedMatches)],
          ["Participating accounts", number(data.totals.players)], ["Average duration", data.totals.avgDurationSeconds === null ? t("Not measured") : t("{seconds} sec", { seconds: number(data.totals.avgDurationSeconds) })],
        ].map(([label, value], index) => <div key={label} className={`admin-panel p-4 sm:p-6 ${index === 0 ? "border-primary/20" : ""}`}><dt className="text-xs leading-5 text-muted-foreground">{t(label)}</dt><dd className={`mt-3 text-2xl font-bold tracking-tight tabular-nums break-words sm:text-3xl ${index === 0 ? "text-primary" : ""}`}>{value}</dd></div>)}
      </dl>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 px-1 lg:grid-cols-4">
        {[["Average score", number(data.totals.avgScore)], ["Average valid moves", number(data.totals.avgMoves)], ["Measured player results", number(data.totals.telemetryParticipants)], ["Unmeasured player results", number(data.totals.unmeasuredParticipants)]].map(([label, value]) => <div key={label} className="border-l-2 pl-4"><dt className="text-[11px] leading-5 text-muted-foreground">{t(label)}</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd></div>)}
      </dl>
      {!data.totals.matches && <p className="admin-state">{t("No completed matches in this period and mode. Finish a multiplayer match to begin collecting results.")}</p>}
      <section className="admin-panel overflow-hidden" aria-labelledby="attack-heading">
        <div className="flex flex-wrap items-start justify-between gap-4 p-6"><div><h2 id="attack-heading" className="admin-section-title">{t("Attack usage")}</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">{t("Attacks earned from merges, sent attacks, and wins among senders.")}</p></div><span className="admin-badge admin-badge-positive">{t("{count} measured results", { count: number(data.totals.telemetryParticipants) })}</span></div>
        {!data.totals.telemetryParticipants ? <p className="px-6 pb-6 text-sm text-muted-foreground">{t("No attack telemetry in this selection yet.")}</p> : <div className="overflow-x-auto" role="region" aria-label={t("Attack usage table")} tabIndex={0}>
          <table className="w-full text-sm text-left"><caption className="sr-only">{t("Attack totals and usage-associated win rates")}</caption><thead><tr>{["Attack", "Charged", "Sent", "Received", "Sender samples", "Wins when sent", "Win rate"].map(label => <th scope="col" key={label} className="p-4 whitespace-nowrap">{t(label)}</th>)}</tr></thead>
            <tbody>{data.attacks.map(attack => <tr key={attack.type} className="border-t"><th scope="row" className="p-4 whitespace-nowrap"><span className={`admin-badge ${attack.type === "xblock" ? "admin-badge-warm" : "admin-badge-positive"}`}>{t(attack.type === "xblock" ? "X block" : "Hard block")}</span><span className="ml-2 text-xs font-normal text-muted-foreground">{attack.type === "xblock" ? "256" : "512"}</span></th><td className="p-4">{number(attack.charged)}</td><td className="p-4 font-semibold">{number(attack.sent)}</td><td className="p-4">{number(attack.received)}</td><td className="p-4">{number(attack.participantsWhoSent)}</td><td className="p-4">{number(attack.winsWhenSent)}</td><td className="p-4 whitespace-nowrap">{attack.participantsWhoSent ? <><strong>{number(100 * attack.winsWhenSent / attack.participantsWhoSent)}%</strong><span className="ml-2 text-xs text-muted-foreground">{t("n={count}", { count: number(attack.participantsWhoSent) })}</span></> : <span className="text-muted-foreground">{t("No senders")}</span>}</td></tr>)}</tbody>
          </table>
        </div>}
        <p className="border-t bg-muted/40 px-6 py-4 text-[11px] leading-5 text-muted-foreground">{t("Only measured player results are included. Missing historical telemetry is excluded, not counted as zero. Win rate is the share of sender results ending in a win. It shows correlation, not the attack’s effect. A result may appear in both rows.")}</p>
      </section>
      <div className="grid md:grid-cols-2 gap-4">
        <Counts title="Matches by mode" rows={data.modes.map(row => ({ label: row.mode, count: row.matches }))} />
        <Counts title="Match ending reasons" rows={data.reasons.map(row => ({ label: row.reason, count: row.matches }))} />
        <Counts title="Daily completed matches (KST)" rows={data.daily.map(row => ({ label: new Date(`${row.date}T00:00:00+09:00`).toLocaleDateString(locale, { timeZone: "Asia/Seoul", dateStyle: "medium" }), count: row.matches }))} />
        <Counts title="Current ranked tier distribution" description="All players with a ranked rating; independent of the period and mode filters." rows={data.tiers.map(row => ({ label: row.tier, count: row.players }))} />
      </div>
    </>}
  </section>;
}

function Counts({ title, description, rows }: { title: string; description?: string; rows: { label: string; count: number }[] }) {
  const { t, locale } = useI18n();
  const maximum = Math.max(1, ...rows.map(row => row.count));
  return <section className="admin-panel p-6 space-y-5">
    <h2 className="admin-section-title">{t(title)}</h2>
    {description && <p className="text-xs leading-5 text-muted-foreground">{t(description)}</p>}
    {!rows.length ? <p className="text-sm text-muted-foreground">{t("No data yet.")}</p> : <ul className="space-y-5 max-h-80 overflow-y-auto">{rows.map(row => <li key={row.label} className="text-xs"><div className="flex justify-between gap-4"><span className="capitalize text-muted-foreground">{t(row.label.replaceAll("_", " "))}</span><span className="font-semibold tabular-nums">{row.count.toLocaleString(locale)}</span></div><div aria-hidden="true" className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-1.5 rounded-full bg-secondary-foreground/75" style={{ width: `${row.count / maximum * 100}%` }} /></div></li>)}</ul>}
  </section>;
}
