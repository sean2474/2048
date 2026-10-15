export type EmblemKind = "duel" | "crown" | "loadout" | "guide" | "settings" | "profile" | "history" | "friend" | "feedback" | "coin";

/** Shared line artwork; adjacent text supplies the accessible name. */
export function GameEmblem({ kind, className = "size-12" }: { kind: EmblemKind; className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={`shrink-0 ${className}`} data-emblem={kind}>
    {kind === "duel" && <>
      <path d="m4 3 4 1 11 12-3 3L4 8 3 4Z M14 20l6-6m-3 4 4 3" />
      <path d="m15 6 5-3 1 1-1 4-4 4M8 14l-3 3 2 2 3-3m-6-2 6 6m-3-2-4 3" />
    </>}
    {kind === "coin" && <><circle cx="12" cy="12" r="8.5" /><path d="m12 7 3.5 5-3.5 5-3.5-5Z" /></>}
    {kind === "loadout" && <>
      <rect x="3.5" y="3.5" width="6" height="6" rx="1.5" /><rect x="3.5" y="14.5" width="6" height="6" rx="1.5" /><rect x="14.5" y="14.5" width="6" height="6" rx="1.5" />
      <path d="m17.5 2.5 1.3 3.7 3.7 1.3-3.7 1.3-1.3 3.7-1.3-3.7-3.7-1.3 3.7-1.3Z" />
    </>}
    {kind === "crown" && <path d="m3 6 5 4 4-6 4 6 5-4-2 11H5Z M6 20h12" />}
    {kind === "guide" && <path d="M12 6c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Zm0 0v14M6 9h3m6 0h3M6 13h3m6 0h3" />}
    {kind === "settings" && <>
      <path d="M4 7h3m4 0h9M4 17h9m4 0h3" /><circle cx="9" cy="7" r="2" /><circle cx="15" cy="17" r="2" />
    </>}
    {kind === "profile" && <><circle cx="12" cy="8" r="3.5" /><path d="M5 20v-1a7 5 0 0 1 14 0v1" /></>}
    {kind === "history" && <path d="M3 10a9 9 0 1 1 2 8M3 5v5h5M12 7v5l3 2" />}
    {kind === "friend" && <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 4 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 3a4 4 0 0 1 3 4v2" /></>}
    {kind === "feedback" && <path d="M6 4h12a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-7l-5 3v-3a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Z M7 9h10M7 13h6" />}
  </svg>;
}
