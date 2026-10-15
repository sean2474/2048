import type { SkinTokens } from "schema/loadout";
import { tileBg, tileFg } from "@/lib/tile-colors";

const PATTERNS = {
  dots: "radial-gradient(#5e4c3b26 1px, transparent 1px)",
  gingham: "repeating-linear-gradient(0deg, #ffffff30 0 12%, transparent 12% 24%), repeating-linear-gradient(90deg, #5e4c3b14 0 12%, transparent 12% 24%)",
  pinstripe: "repeating-linear-gradient(135deg, transparent 0 9%, #5e4c3b30 9% 12%, transparent 12% 21%)",
  weave: "repeating-linear-gradient(0deg, #5e4c3b20 0 1px, transparent 1px 4px), repeating-linear-gradient(90deg, #ffffff55 0 1px, transparent 1px 4px)",
  runes: undefined,
};

// Shared by the catalog and game so previews always match the equipped skin.
export function NumberTile({ value, tokens }: { value: number; tokens: SkinTokens }) {
  const palette = tokens.tilePalette;
  const background = palette ? palette[Math.min(Math.max(Math.log2(value) - 1, 0), palette.length - 1)] : tileBg(value);
  const pattern = tokens.tilePattern ? PATTERNS[tokens.tilePattern] : undefined;
  const armored = tokens.character === "sentinel" || tokens.character === "runeknight";

  return <span aria-hidden="true" className="relative grid size-full place-items-center overflow-hidden font-extrabold tracking-tight" style={{ backgroundColor: background, backgroundImage: pattern, backgroundSize: tokens.tilePattern === "dots" ? "22% 22%" : undefined, color: palette ? "#493b40" : tileFg(value), borderRadius: tokens.tileRadius }}>
    {tokens.tilePattern === "runes" && <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" aria-hidden="true" fill="none" stroke="#5e4c3b66" strokeWidth="2" strokeLinecap="square"><path d="M12 28V10l9 6-9 6m60-10h17l-8 8 8 8M12 72l8 8-8 8m9-16v16m53-8h16m-8-8v16" /></svg>}
    {tokens.character && <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" fill="none" aria-hidden="true" focusable="false">
      {armored ? <>
        <path d="m9 29 12-17h58l12 17v51L79 94H21L9 80Z" fill="#33434e" stroke="#202d38" strokeWidth="2" />
        <path d="m14 29 12-12h48l12 12-12 13H26Z" fill="#8097a4" />
        <path d="m23 28 13-6h28l13 6-8 14H31Z" fill="#182b37" />
        <path d="M31 32h38" stroke={tokens.character === "sentinel" ? "#8af1ed" : "#f6d38d"} strokeWidth="5" />
        {tokens.character === "runeknight" ? <path d="m50 4 9 12-9 13-9-13Z" fill="#f3d298" stroke="#6c5439" strokeWidth="2" /> : <path d="M7 40V23m86 17V23M43 12V7h14v5" stroke="#bfdce1" strokeWidth="4" />}
        <path d="m9 49 9-6h64l9 6v32l-9 9H18l-9-9Z" fill="#edf0e8" stroke="#82959b" strokeWidth="2" />
        <path d="M10 52v18m80-18v18" stroke={tokens.character === "sentinel" ? "#8af1ed" : "#f6d38d"} strokeWidth="3" />
      </> : <>
      {tokens.character === "cat" ? <>
        <path d="M12 38V12Q12 5 19 10L34 22Q50 16 66 22L81 10Q88 5 88 12V38" fill="#fff7e9" stroke="#8b6555" strokeWidth="2" strokeLinejoin="round" />
        <path d="m19 18 12 9-12 8Zm62 0-12 9 12 8Z" fill="#e9a2a0" />
      </> : tokens.character === "bunny" ? <>
        <path d="M23 31Q9 0 26 4Q37 6 39 29M61 29Q63 6 74 4Q91 0 77 31" fill="#fff7f0" stroke="#8b6555" strokeWidth="2" />
        <path d="m25 13 6 14m44-14-6 14" stroke="#e9a2ba" strokeWidth="6" strokeLinecap="round" />
      </> : <path d="m50 3 33 27 11 53-20 11H26L6 83l11-53Z" fill="#4c446a" stroke="#302941" strokeWidth="2" />}
      <rect x="9" y="24" width="82" height="70" rx="25" fill="#fff9ef" stroke="#8b6555" strokeWidth="2" />
      {tokens.character === "arcanist" ? <>
        <path d="m15 32 35-24 35 24-11 16H26Z" fill="#574b79" stroke="#302941" strokeWidth="2" />
        <path d="m50 12 4 8 8 4-8 4-4 8-4-8-8-4 8-4Z" fill="#e9d49d" />
        <path d="M30 37h9m22 0h9" stroke="#d0edf0" strokeWidth="3" />
      </> : <>
        <ellipse cx="25" cy="46" rx="7" ry="4" fill="#f2b7b0" /><ellipse cx="75" cy="46" rx="7" ry="4" fill="#f2b7b0" />
        <path d="M34 37v3m32-3v3" stroke="#624636" strokeWidth="4" strokeLinecap="round" />
        <path d="m47 41 3 2 3-2m-3 2v3m-5-1q2 4 5 1 3 3 5-1" stroke="#624636" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </>}
      </>}
    </svg>}
    <span className={tokens.character ? "absolute inset-x-[10%] top-[48%] bottom-[10%] flex items-center justify-center leading-none" : "relative rounded-sm px-[6%] leading-tight"} style={{ backgroundColor: tokens.tilePattern ? background : undefined, color: tokens.character ? "#493b40" : undefined, fontSize: tokens.character && value >= 128 ? ".86em" : undefined }}>{value}</span>
  </span>;
}
