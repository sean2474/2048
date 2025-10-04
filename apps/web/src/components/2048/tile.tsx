import { Cell } from "@/types";
import { cn } from "@/lib/utils";
import { tileBg, tileFg } from "@/lib/tile-colors";

export function Tile({ tile }: { tile: Cell }) {
  const { row, col, value, spawned, merged, ghost } = tile;
  
  return (
    <div 
      className={cn(
        "absolute pointer-events-none select-none w-[var(--tile)] h-[var(--tile)]",
        "transition-transform duration-100 ease-out",
      )} 
      style={{
        transform: `translate(calc((100% + var(--gap)) * ${col}), calc((100% + var(--gap)) * ${row}))`,
        fontSize: value >= 1024 ? "2.4rem" : value >= 128 ? "2.7rem" : "3rem",
        zIndex: ghost ? 20 : merged ? 30 : 40,
      }}
    >
      <div 
        className={cn(
          "grid place-items-center rounded-md w-full h-full",
          spawned && "animate-[pop-spawn_0.18s_ease-out_50ms_both]",
          merged && "animate-[pop-merge_0.16s_ease-out_50ms_both]"
        )}
        style={{
          background: tileBg(value),
          color: tileFg(value),
        }}
      >
        {value}
      </div>
    </div>
  );
}
