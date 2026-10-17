'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdminOperations } from 'schema/admin';
import { Button } from 'ui/button';
import { useI18n } from 'ui/i18n';
import { adminTime } from '@/lib/investigation';
const errors: Record<string, string> = {
  not_configured: 'Administration unavailable',
  socket_not_configured: 'Socket operations URL is not configured.',
  authentication_required: 'Administrator access required',
  admin_access_required: 'Administrator access required',
  admin_verification_unavailable: 'Administrator permission could not be verified.',
  socket_verification_unavailable: 'Socket permission verification is unavailable.',
  socket_unreachable: 'The game server could not be reached.',
};

export default function OperationsPage() {
  const { t, locale } = useI18n();
  const [data, setData] = useState<AdminOperations | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [failures, setFailures] = useState(0);
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState<{ responding: boolean; checkedAt: string } | null>(null);
  const controller = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (controller.current) return;
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    try {
      const response = await fetch('/api/operations', { cache: 'no-store', signal: request.signal });
      const result = await response.json();
      if (controller.current === request) setHealth(result.health ?? null);
      if (!response.ok) throw new Error(errors[result.error] ?? 'The game server could not be reached.');
      if (controller.current === request) {
        setData(result as AdminOperations);
        setCheckedAt(new Date().toISOString());
        setError('');
        setFailures(0);
      }
    } catch (failure) {
      if (controller.current === request && !request.signal.aborted) {
        setError(failure instanceof Error ? failure.message : 'The game server could not be reached.');
        setFailures(count => count + 1);
      }
    } finally {
      if (controller.current === request) {
        controller.current = null;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
    const refreshWhenVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    const timer = setInterval(refreshWhenVisible, 30000);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      controller.current?.abort();
      controller.current = null;
    };
  }, [refresh]);

  const oldest = data?.storage?.pending[0];
  const delayed = data && oldest && Date.parse(data.collectedAt) - Date.parse(oldest.endedAt) > 120000;
 return <section className="space-y-6" aria-labelledby="operations-heading"><div className="flex justify-between items-start gap-4"><div><p className="admin-eyebrow mb-2">{t('Game operations')}</p><h1 id="operations-heading" className="admin-title">{t('Operations')}</h1><p className="mt-2 text-sm text-muted-foreground">{t('Read-only live process state. Refreshes every 30 seconds while visible.')}</p></div><Button variant="outline" disabled={loading} onClick={()=>void refresh()}>{t('Refresh')}</Button></div>
 {health && <p className="text-xs text-muted-foreground">{t(health.responding ? "Public health endpoint responded. Detailed state still requires administrator verification." : "Public health endpoint did not respond successfully.")} {adminTime(health.checkedAt, locale)}</p>}
 {error&&<p role="alert" className="admin-error">{t(error)} {data&&t('Showing the last successful snapshot.')} {failures>=2&&t('Two or more refreshes failed.')}</p>}
 {loading&&!data&&<p className="admin-state" role="status">{t('Loading records…')}</p>}
 {data&&<><p className="text-xs leading-6 text-muted-foreground">{t('Server started')}: {adminTime(data.startedAt,locale)}<br/>{t('Collected')}: {adminTime(data.collectedAt,locale)}<br/>{t('Last successful check')}: {checkedAt&&adminTime(checkedAt,locale)}</p>
 <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[['Connected sessions',data.sessions],['Ready rooms',data.rooms.ready],['Playing rooms',data.rooms.playing],['Reconnecting rooms',data.rooms.reconnecting]].map(([label,count])=><div key={label} className="admin-panel p-5"><dt className="text-xs text-muted-foreground">{t(String(label))}</dt><dd className="mt-3 text-3xl font-bold tabular-nums">{count.toLocaleString(locale)}</dd></div>)}</dl>
 <section className="admin-panel p-6 space-y-4"><h2 className="admin-section-title">{t('Matchmaking queues')}</h2><dl className="grid gap-6 sm:grid-cols-3">{(['casual','ranked'] as const).map(mode=><div key={mode}><dt className="text-xs text-muted-foreground">{t(mode)}</dt><dd className="mt-2 text-lg font-semibold">{data.queues[mode].count.toLocaleString(locale)}<span className="block mt-1 text-xs font-normal text-muted-foreground">{t('Oldest wait')}: {Math.floor(data.queues[mode].oldestWaitMs/1000)}s</span></dd></div>)}<div><dt className="text-xs text-muted-foreground">{t('Friend code waits')}</dt><dd className="mt-2 text-lg font-semibold">{data.queues.friend.toLocaleString(locale)}</dd></div></dl></section>
 <section className="admin-panel p-6 space-y-4"><h2 className="admin-section-title">{t('Result storage')}</h2>{!data.storage?<p className="admin-error">{t('Result storage is not configured.')}</p>:<>
 {(delayed||data.storage.readErrorAt||data.storage.writeErrorAt)&&<p role="alert" className="admin-error">{delayed&&t('A result has waited more than two minutes.')} {data.storage.readErrorAt&&t('Outbox read failure.')} {data.storage.writeErrorAt&&t('Outbox write failure.')}</p>}
 <dl className="grid gap-4 sm:grid-cols-2"><div><dt className="text-xs text-muted-foreground">{t('Pending results')}</dt><dd className="mt-2 text-2xl font-semibold">{data.storage.pendingCount.toLocaleString(locale)}</dd></div><div><dt className="text-xs text-muted-foreground">{t('Blocked ranked accounts')}</dt><dd className="mt-2 text-2xl font-semibold">{data.storage.blockedRankedAccounts.toLocaleString(locale)}</dd></div></dl><p className="text-xs text-muted-foreground">{t('Last remote save')}: {data.storage.lastRemoteSuccessAt?adminTime(data.storage.lastRemoteSuccessAt,locale):t('No successful save in this process yet.')}</p>
 {data.storage.pending.length>0&&<ul className="max-h-72 overflow-y-auto divide-y text-xs">{data.storage.pending.map(job=><li className="py-3 space-y-1" key={job.id}><p className="break-all font-mono">{job.id}</p><p className="text-muted-foreground">{t('Ended')}: {adminTime(job.endedAt,locale)}</p></li>)}</ul>}</>}
 <p className="text-xs leading-6 text-muted-foreground">{t('Pending results may already be in the database if acknowledgement or disk cleanup failed. Automatic retries continue; this screen never edits results.')}</p></section></>}
 </section>;
}
