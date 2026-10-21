"use client";

import { useEffect, useState } from "react";
import { Play, RotateCcw } from "lucide-react";
import type { Skin, SkinId } from "schema/loadout";
import { useI18n } from "ui/i18n";
import { Button } from "@/components/ui/button";
import { SoundToggle } from "@/components/widget/audio-controls";
import { useAudio } from "@/hooks/audio-provider";
import { boardBackground } from "@/lib/catalog-assets";
import { NumberTile } from "./number-tile";
import { MergeFlair } from "./merge-flair";
import { trackGameEvent } from "@/lib/analytics";

export function SkinMergePreview({ skin }: { skin: Skin & { id: SkinId } }) {
  const { t } = useI18n();
  const { play, ready, muted, volume, unavailable } = useAudio();
  const [phase, setPhase] = useState<"idle" | "moving" | "merged" | "finished">("idle");
  const busy = phase === "moving" || phase === "merged";
  const merged = phase === "merged" || phase === "finished";

  useEffect(() => {
    if (phase !== "moving" && phase !== "merged") return;
    const timer = window.setTimeout(
      () => {
        if (phase === "moving") {
          setPhase("merged");
          play("merge", skin.id);
        } else setPhase("finished");
      },
      phase === "moving" ? 300 : 420,
    );
    return () => window.clearTimeout(timer);
  }, [phase, play, skin.id]);

  return (
    <div className="space-y-3" data-skin-preview={skin.id} data-phase={phase}>
      <figure className="py-2" aria-label={t("Two equal 2 tiles merge into one 4 tile")}>
        <div
          aria-hidden="true"
          className="mx-auto grid w-44 grid-cols-2 gap-2 p-3"
          style={{
            background: boardBackground(skin.tokens),
            borderRadius: `calc(${skin.tokens.tileRadius} + .75rem)`,
          }}
        >
          <div
            className="relative size-[72px]"
            style={{
              background: skin.tokens.emptyBackground,
              borderRadius: skin.tokens.tileRadius,
            }}
          >
            <div
              className="relative size-full text-2xl"
              data-merge-effect={merged ? skin.tokens.character : undefined}
              style={{ borderRadius: skin.tokens.tileRadius }}
            >
              <NumberTile value={merged ? 4 : 2} tokens={skin.tokens} />
              {merged && skin.tokens.character && <MergeFlair character={skin.tokens.character} />}
            </div>
          </div>
          <div
            className="relative size-[72px]"
            style={{
              background: skin.tokens.emptyBackground,
              borderRadius: skin.tokens.tileRadius,
            }}
          >
            {!merged && (
              <div className="skin-preview-source relative size-full text-2xl">
                <NumberTile value={2} tokens={skin.tokens} />
              </div>
            )}
          </div>
        </div>
        <figcaption
          className="mt-3 text-center text-xs font-semibold tabular-nums text-muted-foreground"
          aria-hidden="true"
        >
          2 + 2 <span className="mx-1">→</span> 4
        </figcaption>
      </figure>
      <Button
        variant="secondary"
        className="w-full"
        disabled={!ready}
        aria-disabled={busy}
        onClick={() => {
          if (!busy) {
            setPhase("moving");
            trackGameEvent("merge_previewed", {
              skin: skin.id,
              sound: !unavailable && !muted && volume > 0,
            });
          }
        }}
      >
        {phase === "idle" ? <Play aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}
        {t(
          busy
            ? "Playing merge…"
            : phase === "idle"
              ? "Preview merge effect"
              : "Replay merge effect",
        )}
      </Button>
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        <SoundToggle />
        <p role="status" className="text-xs text-muted-foreground">
          {t(
            unavailable
              ? "Sound unavailable · motion only"
              : muted || volume === 0
                ? "Sound off · motion only"
                : "Skin motion + sound",
          )}
        </p>
      </div>
    </div>
  );
}
