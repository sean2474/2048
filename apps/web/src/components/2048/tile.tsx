import { Cell } from "@/types";
import { cn } from "@/lib/utils";
import type { SkinTokens } from "schema/loadout";
import { NumberTile } from "./number-tile";
import { MergeFlair } from "./merge-flair";
import { useI18n } from "ui/i18n";
import { Pin } from "lucide-react";

export function Tile({ tile, tokens }: { tile: Cell; tokens: SkinTokens }) {
  const { t } = useI18n();
  const { row, col, value, spawned, merged, ghost, blockType } = tile;
  
  const type = blockType || "normal";
  const isXBlock = type === "xblock";
  const isHardBlock = type === "hardblock";
  const numberScale = Math.min(1, 4 / String(value).length);
  
  return (
    <div 
      className={cn(
        "absolute pointer-events-none select-none w-[var(--tile)] h-[var(--tile)]",
        "transition-transform duration-100 ease-out",
      )} 
      style={{
        transform: `translate(calc((100% + var(--gap)) * ${col}), calc((100% + var(--gap)) * ${row}))`,
        fontSize: value >= 1024 ? `clamp(var(--tile-font-min, ${0.8 * numberScale}rem), ${5.5 * numberScale}cqw, ${1.8 * numberScale}rem)` : value >= 128 ? "clamp(var(--tile-font-min, 1rem), 7cqw, 2.2rem)" : "clamp(var(--tile-font-min, 1.15rem), 8.5cqw, 2.7rem)",
        zIndex: ghost ? 20 : merged ? 30 : 40,
      }}
    >
      <div 
        className={cn(
          "relative grid place-items-center w-full h-full",
          isXBlock || isHardBlock ? "rounded-md" : "rounded-lg font-extrabold tracking-tight shadow-[0_2px_0_rgba(65,50,27,0.1)]",
          spawned && "animate-[pop-spawn_0.18s_ease-out_50ms_both]",
          merged && !tokens.character && "animate-[pop-merge_0.16s_ease-out_50ms_both]",
          isXBlock && "border-4 border-red-600",
          isHardBlock && "border-4 border-gray-900"
        )}
        role="img"
        data-merge-effect={merged && !ghost && !isXBlock && !isHardBlock ? tokens.character : undefined}
        aria-label={t("{tile}, row {row}, column {column}", { tile: isHardBlock ? t("Hard block, fixed obstacle") : isXBlock ? t("X block, movable obstacle") : t("{value} tile", { value }), row: row + 1, column: col + 1 })}
        aria-hidden={ghost || undefined}
        style={{
          background: isHardBlock ? "#2c2c2c" : isXBlock ? "#ff6b6b" : undefined,
          color: isHardBlock || isXBlock ? "#ffffff" : undefined,
          borderWidth: isHardBlock || isXBlock ? "var(--block-border, 4px)" : undefined,
          borderRadius: isHardBlock || isXBlock ? undefined : "var(--skin-tile-radius, 0.5rem)",
        }}
      >
        {isHardBlock ? null : isXBlock ? <span aria-hidden="true" className="font-black" style={{ fontSize: "var(--x-font-size, min(2.25rem, 12cqw))" }}>✖</span> : <NumberTile value={value} tokens={tokens} />}
        {tile.anchored && !ghost && <span className="absolute inset-0 rounded-[inherit] ring-2 ring-inset ring-primary" data-anchored="true"><span role="img" aria-label={t("Anchored tile")} className="absolute right-0 top-0 rounded-bl bg-primary p-0.5 text-primary-foreground"><Pin aria-hidden="true" className="size-2.5" /></span></span>}
        {merged && !ghost && !isXBlock && !isHardBlock && tokens.character && <MergeFlair character={tokens.character} />}
      </div>
    </div>
  );
}
