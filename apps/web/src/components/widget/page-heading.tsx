import type { ReactNode } from "react";
import { GameEmblem, type EmblemKind } from "./game-emblem";

export function PageHeading({ icon, title, description, eyebrow, children }: {
  icon: EmblemKind;
  title: string;
  description?: string;
  eyebrow?: string;
  children?: ReactNode;
}) {
  return <div className="game-page-heading">
    <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
      <GameEmblem kind={icon} className="size-14 rounded-2xl bg-accent/40 p-3.5 sm:size-16 sm:p-4" />
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-[10px] font-bold uppercase tracking-[.16em] text-primary sm:text-xs">{eyebrow}</p>}
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>}
      </div>
    </div>
    {children && <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
  </div>;
}
