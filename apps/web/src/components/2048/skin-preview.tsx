import type { Skin } from "schema/loadout";
import { boardBackground } from "@/lib/catalog-assets";
import { NumberTile } from "./number-tile";

export function SkinPreview({ skin, large = false }: { skin: Skin; large?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`grid max-w-full grid-cols-3 gap-0.5 p-1.5 ${large ? "w-36" : "w-[72px] sm:w-20"}`}
      style={{
        background: boardBackground(skin.tokens),
        borderRadius: `calc(${skin.tokens.tileRadius} + 0.375rem)`,
      }}
    >
      {[2, 4, null, 8, null, 16, null, 32, null].map((value, index) => (
        <span
          key={index}
          className="grid aspect-square place-items-center text-[9px] font-bold"
          style={{ borderRadius: skin.tokens.tileRadius, background: skin.tokens.emptyBackground }}
        >
          {value !== null && <NumberTile value={value} tokens={skin.tokens} />}
        </span>
      ))}
    </span>
  );
}
