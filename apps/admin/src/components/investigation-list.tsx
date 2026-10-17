import Link from 'next/link';
import type { AdminAuditResult, AdminMatchesResult } from 'schema/admin';
import { getI18n } from '@/lib/i18n/server';
import { RefreshButton } from '@/components/refresh-button';
import { Button } from 'ui/button';
import { createClient } from '@/lib/supabase/server';
import { adminTime, kstDate } from '@/lib/investigation';

export async function InvestigationList({ kind, search }: { kind: "matches" | "audit"; search: Record<string, string | string[] | undefined> }) {
  const [{ t, locale }, client] = await Promise.all([getI18n(), createClient()]);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) if (typeof value === "string") params.set(key, value);
  const pathname = `/${kind}`, query = params.toString();
  const from = params.get("from") ?? kstDate(Date.now() - 6 * 86400000), to = params.get("to") ?? kstDate();
  const args = { p_from: from, p_to: to, p_player_id: params.get("player") || null,
    p_before_time: params.get("before") || null, p_before_id: params.get("cursor") || null,
    ...(kind === "matches" ? { p_match_id: params.get("match") || null, p_mode: params.get("mode") || "all", p_reason: params.get("reason") || "all" }
      : { p_actor_id: params.get("actor") || null, p_action: params.get("action") || "all" }) };
  let data: AdminMatchesResult | AdminAuditResult | null = null, error = "";
  try {
    const result = await client.rpc(kind === "matches" ? "admin_matches" : "admin_audit_entries", args);
    if (result.error) {
      const code = result.error.code;
      throw new Error(code === "42501" ? "Administrator access required" : ["22023", "22P02", "22007", "22008"].includes(code) ? "Check UUIDs and the date range (maximum 90 days)." : "Records could not be loaded. Check your connection and try again.");
    }
    data = result.data as AdminMatchesResult | AdminAuditResult;
  } catch (failure) { error = failure instanceof Error ? failure.message : "Records could not be loaded. Check your connection and try again."; }
  const first = new URLSearchParams(params); first.delete("before"); first.delete("cursor");
  const next = new URLSearchParams(params);
  if (data?.hasMore && data.nextCursor) { next.set("before", data.nextCursor.time); next.set("cursor", data.nextCursor.id); }
  const title = kind === 'matches' ? 'Matches' : 'Audit log';
  return <section className="space-y-6" aria-labelledby="investigation-title">
    <div><p className="admin-eyebrow mb-2">{t('Game operations')}</p><h1 id="investigation-title" className="admin-title">{t(title)}</h1><p className="mt-2 text-sm text-muted-foreground">{t('Dates use KST. Up to 90 days per search; 50 records per page.')}</p></div>
    <form key={query} className="admin-panel flex flex-wrap items-end gap-4 p-4 sm:p-6" action={pathname}>
      {[['from','From',from],['to','To',to]].map(([name,label,value]) => <label className="grid gap-2 text-xs font-semibold" key={name}>{t(label)}<input className="admin-field" type="date" required name={name} defaultValue={value} /></label>)}
      {(kind === 'matches' ? [['match','Match ID'],['player','Player UUID']] : [['actor','Actor UUID'],['player','Player UUID']]).map(([name,label]) => <label key={name} className="grid min-w-0 grow gap-2 text-xs font-semibold sm:max-w-xs">{t(label)}<input name={name} defaultValue={params.get(name) ?? ''} maxLength={36} className="admin-field w-full" placeholder="UUID" /></label>)}
      {(kind === 'matches' ? [['mode','Mode',['all','casual','ranked','friend','legacy']],['reason','Reason',['all','reached_1024','opponent_locked','surrender','opponent_disconnected','draw']]] as const : [['action','Action',['all','suspend','unsuspend']]] as const).map(([name,label,options]) => <label key={name} className="grid gap-2 text-xs font-semibold">{t(label)}<select className="admin-field" name={name} defaultValue={params.get(name) || 'all'}>{options.map(value => <option value={value} key={value}>{t(value.replaceAll('_',' '))}</option>)}</select></label>)}
      <Button type="submit">{t('Search')}</Button><RefreshButton />
    </form>
    {kind === 'matches' && <p className="text-xs text-muted-foreground">{t('Exact match ID searches also include matches outside the selected dates.')}</p>}
    {error ? <p role="alert" className="admin-error">{t(error)}</p> : data && <>
      {'matches' in data ? data.matches.length ? <div className="admin-panel overflow-x-auto" role="region" aria-label={t('Matches')} tabIndex={0}><table className="w-full text-left text-sm"><caption className="sr-only">{t('Completed matches and both participants')}</caption><thead><tr>{['Match ID','Ended','Mode','Participants','Reason','Duration'].map(label=><th scope="col" className="p-4 whitespace-nowrap" key={label}>{t(label)}</th>)}</tr></thead><tbody>{data.matches.map(match=><tr key={match.id} className="border-t"><th scope="row" className="p-4 min-w-64 font-normal"><Link className="inline-flex min-h-11 items-center text-primary underline break-all" href={`/matches/${match.id}?returnTo=${encodeURIComponent(`${pathname}?${query}`)}`}>{match.id}</Link></th><td className="p-4 whitespace-nowrap text-xs">{adminTime(match.endedAt,locale)}</td><td className="p-4">{t(match.mode)}</td><td className="p-4 min-w-52">{match.participants.map(p=><p key={p.slot} className="py-1 break-words">{p.name} · {t(p.result)}{!p.playerId && <span className="block text-xs text-muted-foreground">{t('No linked account')}</span>}</p>)}</td><td className="p-4 whitespace-nowrap">{t(match.reason.replaceAll('_',' '))}</td><td className="p-4 whitespace-nowrap">{t('{seconds} sec',{seconds:Math.round(match.durationSeconds)})}</td></tr>)}</tbody></table></div> : <p className="admin-state">{t('No saved matches found.')} <Link href="/operations" className="text-primary underline">{t('Check pending storage')}</Link></p>
      : data.entries.length ? <ol className="admin-panel divide-y">{data.entries.map(entry=><li key={entry.id} className="p-5 space-y-3"><div className="flex flex-wrap justify-between gap-3"><strong>{t(entry.action === 'suspend' ? 'Suspended' : 'Access restored')}</strong><time className="text-xs text-muted-foreground" dateTime={entry.createdAt}>{adminTime(entry.createdAt,locale)}</time></div><p className="whitespace-pre-wrap break-words text-sm">{entry.reason}</p><dl className="grid gap-3 text-xs sm:grid-cols-2">{[['Actor UUID',entry.actorId,entry.actorExists],['Player UUID',entry.playerId,entry.playerExists]].map(([label,id,exists])=><div key={String(label)}><dt className="text-muted-foreground mb-1">{t(String(label))}</dt><dd className="break-all">{exists ? <Link className="inline-flex min-h-11 items-center text-primary underline" href={`/players/${id}`}>{id}</Link> : <>{id}<span className="block">{t('No linked account')}</span></>}</dd></div>)}</dl></li>)}</ol> : <p className="admin-state">{t('No access changes recorded.')}</p>}
      <nav aria-label={t("Record pages")} className="flex gap-3 justify-between"><Button asChild variant="outline"><Link href={`${pathname}?${first}`} aria-disabled={!params.has("before")}>{t("First page")}</Link></Button><Button asChild variant="outline"><Link href={`${pathname}?${next}`} aria-disabled={!data.hasMore || !data.nextCursor}>{t("Next")}</Link></Button></nav>
    </>}
  </section>;
}
