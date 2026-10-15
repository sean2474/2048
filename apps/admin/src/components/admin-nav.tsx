"use client";

import { useI18n } from "ui/i18n";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AdminNav() {
  const { t } = useI18n();
  const pathname = usePathname();
  return <nav aria-label={t("Administration")} className="flex flex-wrap gap-2 md:flex-col">
    {[{ href: "/", label: "Overview" }, { href: "/players", label: "Players" }, { href: "/feedback", label: "Feedback" }].map(item => {
      const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
      return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`flex min-h-11 flex-1 items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-colors md:flex-none ${active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}><svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5">{item.href === "/feedback" ? <path d="M3 3h14v10H8l-5 4V3Z" strokeLinejoin="round" /> : item.href === "/" ? <path d="M3 14V9m7 5V4m7 10V7M2 17h16" strokeLinecap="round" /> : <><circle cx="8" cy="6" r="3" /><path d="M2 17v-2a6 6 0 0 1 12 0v2m0-14a3 3 0 0 1 0 6m3 8v-2a7 7 0 0 0-2-5" strokeLinecap="round" /></>}</svg>{t(item.label)}</Link>;
    })}
  </nav>;
}
