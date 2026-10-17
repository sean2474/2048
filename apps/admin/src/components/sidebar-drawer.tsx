"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useI18n } from "ui/i18n";
import { Button } from "ui/button";

// Native <dialog>: focus trap, Escape and the backdrop come for free; CSS in globals.css animates it.
export function SidebarDrawer({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  useEffect(() => { dialog.current?.close(); }, [pathname]);
  return <>
    <Button type="button" variant="outline" size="icon" aria-label={t("Open menu")} aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>
      <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="M3 5h14M3 10h14M3 15h14" /></svg>
    </Button>
    <dialog ref={dialog} className="admin-drawer" aria-label={t("Administration")} onClick={event => { if (event.target === dialog.current) dialog.current.close(); }}>
      <div className="mb-6 flex items-center justify-between gap-3">
        <p className="admin-eyebrow">{t("Workspace")}</p>
        <Button type="button" variant="ghost" size="icon" aria-label={t("Close menu")} onClick={() => dialog.current?.close()}>
          <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="m5 5 10 10M15 5 5 15" /></svg>
        </Button>
      </div>
      {children}
    </dialog>
  </>;
}
