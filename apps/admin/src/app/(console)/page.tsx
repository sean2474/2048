import { getI18n } from "@/lib/i18n/server";
import { RefreshButton } from "@/components/refresh-button";
import { QuerySelect } from "@/components/query-select";

import { OperationsNotice } from "@/components/operations-notice";
import { adminTime } from "@/lib/investigation";
import type { AdminMode, AdminOverview } from "schema/admin";
import { ABILITIES } from "schema/loadout";
import { getAdminClient } from "@/lib/supabase/admin";
import { BarList, ColumnChart, RateBars, SERIES_COLORS } from "@/components/charts";

export default async function AdminPage({
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
  const number = (value: number | null) =>
    value === null ? t("Not measured") : value.toLocaleString(locale, { maximumFractionDigits: 1 });
  const days = [7, 30, 90].includes(Number(params.days)) ? Number(params.days) : 30;
  const mode: AdminMode = ["casual", "ranked", "friend"].includes(String(params.mode))
    ? (params.mode as AdminMode)
    : "all";
  let data: AdminOverview | null = null,
    error = "";
  try {
    const result = await client.rpc("admin_overview", { p_days: days, p_mode: mode });
    if (result.error) throw result.error;
    data = result.data as AdminOverview;
  } catch {
    error =
      "Statistics could not be loaded. Check your connection and administrator access, then try again.";
  }

  return (
    <section className="space-y-6" aria-labelledby="overview-heading">
      <div className="space-y-6">
        <div>
          <p className="admin-eyebrow mb-2">{t("Game health")}</p>
          <h1 id="overview-heading" className="admin-title">
            {t("Balance overview")}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {t("Match activity, attack usage, and the shape of competition.")}
          </p>
        </div>
        <div className="admin-panel flex flex-wrap gap-4 items-end p-4 sm:px-6">
          <label className="grid gap-2 text-xs font-semibold">
            {t("Period")}
            <QuerySelect
              name="days"
              className="admin-field min-w-36"
              value={String(days)}
              options={[7, 30, 90].map((value) => ({
                value: String(value),
                label: t(`Last ${value} days`),
              }))}
            />
          </label>
          <label className="grid gap-2 text-xs font-semibold">
            {t("Mode")}
            <QuerySelect
              name="mode"
              className="admin-field min-w-32"
              value={mode}
              options={[
                ["all", "All modes"],
                ["casual", "Casual"],
                ["ranked", "Ranked"],
                ["friend", "Friend"],
              ].map(([value, label]) => ({ value, label: t(label) }))}
            />
          </label>
          <span className="mb-3 hidden text-xs text-muted-foreground xl:block">
            {t("Completed matches only")}
          </span>
          <div className="sm:ml-auto">
            <RefreshButton />
          </div>
        </div>
      </div>
      <OperationsNotice />
      {error ? (
        <p role="alert" className="admin-error">
          {t(error)}
        </p>
      ) : (
        data && (
          <>
            <p className="text-xs leading-6 text-muted-foreground">
              {data.periodStart &&
                data.periodEnd &&
                `${adminTime(data.periodStart, locale)} – ${adminTime(data.periodEnd, locale)}`}
              <br />
              {t(
                "The first and last dates are partial days. Participating accounts counts unique linked accounts in completed matches, not all registrations. Elapsed time includes ready and reconnect waits.",
              )}
            </p>
            <dl className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                ["Completed matches", number(data.totals.matches)],
                ["Ranked matches", number(data.totals.rankedMatches)],
                ["Participating accounts", number(data.totals.players)],
                [
                  "Average duration",
                  data.totals.avgDurationSeconds === null
                    ? t("Not measured")
                    : t("{seconds} sec", { seconds: number(data.totals.avgDurationSeconds) }),
                ],
              ].map(([label, value], index) => (
                <div
                  key={label}
                  className={`admin-panel p-4 sm:p-6 ${index === 0 ? "border-primary/20" : ""}`}
                >
                  <dt className="text-xs leading-5 text-muted-foreground">{t(label)}</dt>
                  <dd
                    className={`mt-3 text-2xl font-bold tracking-tight tabular-nums break-words sm:text-3xl ${index === 0 ? "text-primary" : ""}`}
                  >
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 px-1 lg:grid-cols-4">
              {[
                ["Average score", number(data.totals.avgScore)],
                ["Average valid moves", number(data.totals.avgMoves)],
                ["Measured player results", number(data.totals.telemetryParticipants)],
                ["Unmeasured player results", number(data.totals.unmeasuredParticipants)],
              ].map(([label, value]) => (
                <div key={label} className="border-l-2 pl-4">
                  <dt className="text-[11px] leading-5 text-muted-foreground">{t(label)}</dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
            {!data.totals.matches && (
              <p className="admin-state">
                {t(
                  "No completed matches in this period and mode. Finish a multiplayer match to begin collecting results.",
                )}
              </p>
            )}
            <section className="admin-panel overflow-hidden" aria-labelledby="attack-heading">
              <div className="flex flex-wrap items-start justify-between gap-4 p-6">
                <div>
                  <h2 id="attack-heading" className="admin-section-title">
                    {t("Attack usage")}
                  </h2>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {t("Attacks earned from merges, sent attacks, and wins among senders.")}
                  </p>
                </div>
                <span className="admin-badge admin-badge-positive">
                  {t("{count} measured results", {
                    count: number(data.totals.telemetryParticipants),
                  })}
                </span>
              </div>
              {!data.totals.telemetryParticipants ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">
                  {t("No attack telemetry in this selection yet.")}
                </p>
              ) : (
                <div
                  className="overflow-x-auto"
                  role="region"
                  aria-label={t("Attack usage table")}
                  tabIndex={0}
                >
                  <table className="w-full text-sm text-left">
                    <caption className="sr-only">
                      {t("Attack totals and usage-associated win rates")}
                    </caption>
                    <thead>
                      <tr>
                        {[
                          "Attack",
                          "Charged",
                          "Sent",
                          "Received",
                          "Sender samples",
                          "Wins when sent",
                          "Win rate",
                        ].map((label) => (
                          <th scope="col" key={label} className="p-4 whitespace-nowrap">
                            {t(label)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.attacks.map((attack) => (
                        <tr key={attack.type} className="border-t">
                          <th scope="row" className="p-4 whitespace-nowrap">
                            <span
                              className={`admin-badge ${attack.type === "xblock" ? "admin-badge-warm" : "admin-badge-positive"}`}
                            >
                              {t(attack.type === "xblock" ? "X block" : "Hard block")}
                            </span>
                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                              {attack.type === "xblock" ? "256" : "512"}
                            </span>
                          </th>
                          <td className="p-4">{number(attack.charged)}</td>
                          <td className="p-4 font-semibold">{number(attack.sent)}</td>
                          <td className="p-4">{number(attack.received)}</td>
                          <td className="p-4">{number(attack.participantsWhoSent)}</td>
                          <td className="p-4">{number(attack.winsWhenSent)}</td>
                          <td className="p-4 whitespace-nowrap">
                            {attack.participantsWhoSent ? (
                              <>
                                <strong>
                                  {number((100 * attack.winsWhenSent) / attack.participantsWhoSent)}
                                  %
                                </strong>
                                <span className="ml-2 text-xs text-muted-foreground">
                                  {t("n={count}", { count: number(attack.participantsWhoSent) })}
                                </span>
                              </>
                            ) : (
                              <span className="text-muted-foreground">{t("No senders")}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="border-t bg-muted/40 px-6 py-4 text-[11px] leading-5 text-muted-foreground">
                {t(
                  "Only measured player results are included. Missing historical telemetry is excluded, not counted as zero. Win rate is the share of sender results ending in a win. It shows correlation, not the attack’s effect. A result may appear in both rows.",
                )}
              </p>
            </section>
            <section className="admin-panel space-y-5 p-6" aria-labelledby="ability-heading">
              <div>
                <h2 id="ability-heading" className="admin-section-title">
                  {t("Special ability win rates")}
                </h2>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {t(
                    "Share of measured player results that ended in a win, grouped by the ability chosen before the match. The dashed line marks 50%. This shows correlation, not the ability’s effect; fewer than 5 samples are shown faded.",
                  )}
                </p>
              </div>
              <RateBars
                locale={locale}
                emptyLabel={t("No results")}
                lowSampleLabel={t("small sample")}
                sampleLabel={(count) => t("n={count}", { count })}
                rows={ABILITIES.map((ability, index) => {
                  const stat = data.abilities?.find((row) => row.ability === ability.id);
                  return {
                    key: ability.id,
                    label: t(ability.name),
                    color: SERIES_COLORS[index],
                    wins: stat?.wins ?? 0,
                    samples: stat?.participants ?? 0,
                    detail: stat?.uses
                      ? t("{count} uses", { count: stat.uses.toLocaleString(locale) })
                      : undefined,
                  };
                })}
              />
              {data.abilities === undefined && (
                <p className="text-xs text-muted-foreground">
                  {t(
                    "Ability statistics appear once the ability statistics migration is applied to this database.",
                  )}
                </p>
              )}
              <h3 className="text-xs font-semibold">{t("Attack win rates")}</h3>
              <RateBars
                locale={locale}
                emptyLabel={t("No senders")}
                lowSampleLabel={t("small sample")}
                sampleLabel={(count) => t("n={count}", { count })}
                rows={data.attacks.map((attack, index) => ({
                  key: attack.type,
                  label: t(attack.type === "xblock" ? "X block" : "Hard block"),
                  color: SERIES_COLORS[index],
                  wins: attack.winsWhenSent,
                  samples: attack.participantsWhoSent,
                }))}
              />
            </section>
            <section className="admin-panel space-y-4 p-6" aria-labelledby="daily-heading">
              <h2 id="daily-heading" className="admin-section-title">
                {t("Daily completed matches (KST)")}
              </h2>
              <ColumnChart
                locale={locale}
                title={t("Daily completed matches (KST)")}
                valueLabel={t("Completed matches")}
                columns={data.daily.map((row) => {
                  const day = new Date(`${row.date}T00:00:00+09:00`);
                  return {
                    label: day.toLocaleDateString(locale, {
                      timeZone: "Asia/Seoul",
                      month: "numeric",
                      day: "numeric",
                    }),
                    value: row.matches,
                    title: `${day.toLocaleDateString(locale, { timeZone: "Asia/Seoul", dateStyle: "medium" })}: ${row.matches.toLocaleString(locale)}`,
                  };
                })}
              />
            </section>
            <div className="grid gap-4 md:grid-cols-3">
              <Counts
                title="Matches by mode"
                rows={data.modes.map((row) => ({ label: row.mode, count: row.matches }))}
              />
              <Counts
                title="Match ending reasons"
                rows={data.reasons.map((row) => ({ label: row.reason, count: row.matches }))}
              />
              <Counts
                title="Current ranked tier distribution"
                description="All players with a ranked rating; independent of the period and mode filters."
                rows={data.tiers.map((row) => ({ label: row.tier, count: row.players }))}
              />
            </div>
          </>
        )
      )}
    </section>
  );
}

async function Counts({
  title,
  description,
  rows,
}: {
  title: string;
  description?: string;
  rows: { label: string; count: number }[];
}) {
  const { t, locale } = await getI18n();
  return (
    <section className="admin-panel space-y-5 p-6">
      <h2 className="admin-section-title">{t(title)}</h2>
      {description && <p className="text-xs leading-5 text-muted-foreground">{t(description)}</p>}
      {!rows.length ? (
        <p className="text-sm text-muted-foreground">{t("No data yet.")}</p>
      ) : (
        <BarList
          locale={locale}
          rows={rows.map((row) => ({ label: t(row.label.replaceAll("_", " ")), count: row.count }))}
        />
      )}
    </section>
  );
}
