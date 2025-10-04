import { Cell } from "@/types";
import { cn } from "@/lib/utils";
import { tileBg, tileFg } from "@/lib/tile-colors";

export function Tile({ tile }: { tile: Cell }) {
  const { row, col, value, spawned, merged, ghost, blockType } = tile;
  
  // 블록 타입 결정
  const type = blockType || "normal";
  const isXBlock = type === "xblock";
  const isHardBlock = type === "hardblock";
  
  return (
    <div 
      className={cn(
        "absolute pointer-events-none select-none w-[var(--tile)] h-[var(--tile)]",
        "transition-transform duration-100 ease-out",
      )} 
      style={{
        transform: `translate(calc((100% + var(--gap)) * ${col}), calc((100% + var(--gap)) * ${row}))`,
        fontSize: value >= 1024 ? "1.8rem" : value >= 128 ? "2.5rem" : "2.8rem",
        zIndex: ghost ? 20 : merged ? 30 : 40,
      }}
    >
      <div 
        className={cn(
          "grid place-items-center rounded-md w-full h-full",
          spawned && "animate-[pop-spawn_0.18s_ease-out_50ms_both]",
          merged && "animate-[pop-merge_0.16s_ease-out_50ms_both]",
          isXBlock && "border-4 border-red-600",
          isHardBlock && "border-4 border-gray-900"
        )}
        style={{
          background: isHardBlock ? "#2c2c2c" : isXBlock ? "#ff6b6b" : tileBg(value),
          color: isHardBlock ? "#ffffff" : isXBlock ? "#ffffff" : tileFg(value),
        }}
      >
        {isHardBlock ? (
          <></>
        ) : isXBlock ? (
          <span className="text-4xl font-black">✖</span>
        ) : (
          value
        )}
      </div>
    </div>
  );
}
