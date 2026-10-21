"use client";

import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from "lucide-react";
import type { Dir } from "schema/in-game";
import { useI18n } from "ui/i18n";
import { Button } from "@/components/ui/button";
import { directionButtonHandlers } from "@/lib/game-input";

const directions = [
  { dir: "up", icon: ArrowUp, label: "Move up" },
  { dir: "left", icon: ArrowLeft, label: "Move left" },
  { dir: "down", icon: ArrowDown, label: "Move down" },
  { dir: "right", icon: ArrowRight, label: "Move right" },
] as const;

export function DirectionPad({
  disabled,
  onMove,
}: {
  disabled: boolean;
  onMove: (dir: Dir) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="direction-pad" role="group" aria-label={t("Direction controls")}>
      {directions.map(({ dir, icon: Icon, label }) => (
        <Button
          key={dir}
          type="button"
          variant="outline"
          size="icon"
          data-direction={dir}
          aria-label={t(label)}
          disabled={disabled}
          {...directionButtonHandlers(() => onMove(dir), disabled)}
        >
          <Icon aria-hidden="true" className="size-7" />
        </Button>
      ))}
    </div>
  );
}
