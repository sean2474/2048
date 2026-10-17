'use client';
import { useI18n } from 'ui/i18n';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const items = [
  { href: '/', label: 'Overview', path: 'M3 14V9m7 5V4m7 10V7M2 17h16' },
  { href: '/matches', label: 'Matches', path: 'm4 3 12 12m-1-12L3 15m1-12 3 1-3 3-1-3m13 11-3 1 3 3 1-3M4 13l3 3m6-12 3 3' },
  { href: '/players', label: 'Players', path: 'M11 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM2 17v-2a6 6 0 0 1 12 0v2m0-14a3 3 0 0 1 0 6m3 8v-2a7 7 0 0 0-2-5' },
  { href: '/catalog', label: 'Content catalog', path: 'M3 3h6v6H3Zm8 0h6v6h-6ZM3 11h6v6H3Zm8 0h6v6h-6Z' },
  { href: '/operations', label: 'Operations', path: 'M2 11h4l2-6 4 11 2-5h4M3 3h14v14H3Z' },
  { href: '/audit', label: 'Audit log', path: 'M12 2H4v16h12V6l-4-4v4h4M7 10h6m-6 4h6' },
  { href: '/seasons', label: 'Ranked seasons', path: 'M6 3h8v5a4 4 0 0 1-8 0V3Zm0 1H3v3a4 4 0 0 0 4 4m7-7h3v3a4 4 0 0 1-4 4m-3 1v5m-4 1h8' },
  { href: '/feedback', label: 'Feedback', path: 'M3 3h14v10H8l-5 4V3Z' },
];

export function AdminNav() {
  const { t } = useI18n();
  const pathname = usePathname();
  return <nav aria-label={t('Administration')} className="flex flex-wrap gap-2 md:flex-col">
    {items.map(item => {
      const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
      return <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} className={`flex min-h-11 flex-1 items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-colors md:flex-none ${active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
        <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={item.path} /></svg>{t(item.label)}
      </Link>;
    })}
  </nav>;
}
