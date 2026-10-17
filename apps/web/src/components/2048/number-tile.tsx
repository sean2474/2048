import type { SkinTokens } from "schema/loadout";
import { tileBg, tileFg } from "@/lib/tile-colors";

const PATTERNS = {
  dots: "radial-gradient(#5e4c3b26 1px, transparent 1px)",
  gingham: "repeating-linear-gradient(0deg, #ffffff30 0 12%, transparent 12% 24%), repeating-linear-gradient(90deg, #5e4c3b14 0 12%, transparent 12% 24%)",
  pinstripe: "repeating-linear-gradient(135deg, transparent 0 9%, #5e4c3b30 9% 12%, transparent 12% 21%)",
  weave: "repeating-linear-gradient(0deg, #5e4c3b20 0 1px, transparent 1px 4px), repeating-linear-gradient(90deg, #ffffff55 0 1px, transparent 1px 4px)",
  runes: undefined,
  sunrise: undefined,
  "magic-circle": undefined,
};

// Shared by the catalog and game so previews always match the equipped skin.
export function NumberTile({ value, tokens }: { value: number; tokens: SkinTokens }) {
  const palette = tokens.tilePalette;
  const background = palette ? palette[Math.min(Math.max(Math.log2(value) - 1, 0), palette.length - 1)] : tileBg(value);
  const pattern = tokens.tilePattern ? PATTERNS[tokens.tilePattern] : undefined;
  const armored = tokens.character === "sentinel" || tokens.character === "runeknight";

  return <span aria-hidden="true" className="relative grid size-full place-items-center overflow-hidden font-extrabold tracking-tight" style={{ backgroundColor: background, backgroundImage: pattern, backgroundSize: tokens.tilePattern === "dots" ? "22% 22%" : undefined, color: palette ? "#493b40" : tileFg(value), borderRadius: tokens.tileRadius }}>
    {tokens.tilePattern === "runes" && <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" aria-hidden="true" fill="none" stroke="#5e4c3b66" strokeWidth="2" strokeLinecap="square"><path d="M12 28V10l9 6-9 6m60-10h17l-8 8 8 8M12 72l8 8-8 8m9-16v16m53-8h16m-8-8v16" /></svg>}
    {tokens.tilePattern === "sunrise" && <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" aria-hidden="true" focusable="false" fill="none" stroke="#6b492b80" strokeWidth="2" strokeLinecap="round"><path d="M29 24a21 21 0 0 1 42 0M20 24h60M50 4v7M19 9l7 7M81 9l-7 7M11 37h8M81 37h8M12 78h76M25 86h50" /></svg>}
    {tokens.tilePattern === "magic-circle" && <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" aria-hidden="true" focusable="false" fill="none" stroke="#385b5680" strokeWidth="2"><circle cx="50" cy="50" r="40" /><path d="m50 7 6 8-6 8-6-8Zm0 70 6 8-6 8-6-8ZM7 50l8-6 8 6-8 6Zm70 0 8-6 8 6-8 6ZM14 27V14h13m46 0h13v13M14 73v13h13m46 0h13V73" /></svg>}
    {tokens.character && <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" fill="none" aria-hidden="true" focusable="false">
      {tokens.character === "fox" ? <>
        <path d="m12 45-3-37 29 19h24L91 8l-3 37-12 42H24Z" fill="#7f9ec8" stroke="#31496e" strokeWidth="2" strokeLinejoin="round" />
        <path d="m17 17 15 14-12 8Zm66 0-15 14 12 8Z" fill="#d7f1ff" />
        <path d="m14 42 20 7 16-11 16 11 20-7-7 40-29 14-29-14Z" fill="#f5f6f3" stroke="#6686af" strokeWidth="2" />
        <path d="m27 38 11 3m24 0 11-3" stroke="#273b5f" strokeWidth="4" strokeLinecap="round" />
        <path d="m52 10-8 15h8l-4 12 12-17h-9Z" fill="#ffe6a3" stroke="#967940" />
      </> : tokens.character === "dragon" ? <>
        <path d="m20 35-9-25 23 12m32 0 23-12-9 25" fill="#f0d596" stroke="#72603b" strokeWidth="2" strokeLinejoin="round" />
        <path d="m13 39-9 7 8 9-7 9 10 8m72-33 9 7-8 9 7 9-10 8" fill="#79aa92" stroke="#365d51" strokeWidth="2" />
        <rect x="13" y="22" width="74" height="71" rx="22" fill="#88b89b" stroke="#365d51" strokeWidth="2" />
        <path d="m50 15 9 13-9 12-9-12Z" fill="#f9df9e" stroke="#917344" strokeWidth="2" />
        <path d="m24 38 12 4m28 0 12-4" stroke="#284a43" strokeWidth="4" strokeLinecap="round" />
        <rect x="20" y="49" width="60" height="38" rx="13" fill="#f8edcc" />
        <path d="M28 29v4m44-4v4" stroke="#f7e7ac" strokeWidth="3" />
      </> : tokens.character === "phoenix" ? <>
        <path d="m20 46-15-28 22 10L36 8l14 15L64 8l9 20 22-10-15 28" fill="#d99b76" stroke="#795578" strokeWidth="2" strokeLinejoin="round" />
        <path d="M50 22C29 20 13 35 13 57v18q37 36 74 0V57C87 35 71 20 50 22Z" fill="#b58ac5" stroke="#674a7e" strokeWidth="2" />
        <path d="m18 49 18-4 14 10 14-10 18 4-6 32-26 13-26-13Z" fill="#fff0d5" />
        <path d="m26 37 12 5m24 0 12-5" stroke="#4d365e" strokeWidth="4" strokeLinecap="round" />
        <path d="m50 7 4 11 11 4-11 4-4 11-4-11-11-4 11-4Z" fill="#ffe4a0" stroke="#9d784e" />
        <path d="m45 45 5 7 5-7" fill="#d69b5f" />
      </> : armored ? <>
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
