"use client";
import { memo, useEffect, useRef, type CSSProperties } from "react";
import { type Board, type Dir, SIZE } from "@/types";
import { Tile } from "./tile";
import { useI18n } from "ui/i18n";
import { type SkinId } from "schema/loadout";
import { useCatalog } from "@/hooks/catalog-provider";
import { boardBackground } from "@/lib/catalog-assets";
import { createSwipeGesture } from "@/lib/game-input";
export const BoardView = memo(function BoardView({ board, onMove, label = "Game board", skinId = "classic", size = SIZE }: { board: Board; onMove?: (dir: Dir) => void; label?: string; skinId?: SkinId; size?: number }) {
  const { t } = useI18n();
  const skin = useCatalog().skin(skinId);
  const gesture = useRef(createSwipeGesture());
  useEffect(() => { if (!onMove) gesture.current.cancel(); }, [onMove]);
  const style = {
    "--size": size, "--gap": "var(--board-gap, clamp(6px, 1.4vw, 10px))", "--pad": "var(--gap)",
    "--tile": "calc((100% - (var(--gap) * (var(--size) + 1))) / var(--size))",
    touchAction: onMove ? "none" : "auto",
    containerType: "inline-size",
    background: boardBackground(skin.tokens),
    "--skin-tile-radius": skin.tokens.tileRadius,
    borderRadius: "calc(var(--skin-tile-radius) + var(--pad))",
  } as CSSProperties;
  return <div className="relative aspect-square w-full max-w-[500px] shrink-0 bg-[#cbc5b6] shadow-[0_6px_0_#b3ab99,0_16px_32px_-20px_#544b38] ring-1 ring-[#b7af9e]" style={style}
    role="group" aria-label={t(label)} data-skin={skin.id}
    onTouchStart={event => { if (onMove) gesture.current.start(event.touches); }}
    onTouchCancel={() => gesture.current.cancel()}
    onTouchMove={event => { const direction = gesture.current.move(event.touches); if (direction) onMove?.(direction); }}
    onTouchEnd={event => { const direction = gesture.current.end(event.changedTouches); if (direction) onMove?.(direction); }}>
    <div className="absolute inset-0 grid" style={{ gridTemplateColumns: "repeat(var(--size), 1fr)", gridTemplateRows: "repeat(var(--size), 1fr)", gap: "var(--gap)", padding: "var(--pad)" }}>
      {Array.from({ length: size * size }, (_, index) => <div key={index} className="shadow-inner" style={{ background: skin.tokens.emptyBackground, borderRadius: skin.tokens.tileRadius }} />)}
    </div>
    <div className="relative w-full h-full font-bold" style={{ padding: "var(--pad)" }}>{board.map(tile => <Tile key={tile.id} tile={tile} tokens={skin.tokens} />)}</div>
  </div>;
});
