"use client";

import Link from "next/link";
import { GameEmblem } from "@/components/widget/game-emblem";

import { useI18n } from "ui/i18n";
import { useLoadout } from "@/hooks/use-loadout";

export function LoadoutSummary() {
  const { t } = useI18n();
  const { skin } = useLoadout();
  return (
    <div className="border-t pt-4">
      <Link
        href="/loadout"
        className="flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <GameEmblem kind="loadout" className="size-8" />
        {t("My loadout")}
        <span className="ml-auto text-xs font-normal text-muted-foreground">{t(skin.name)}</span>
      </Link>
    </div>
  );
}
