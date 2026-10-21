import { catalogAssetUrl } from "@/lib/catalog-assets";
import type { SkinTokens } from "schema/loadout";
import { tileBg, tileFg, tileTextColor } from "@/lib/tile-colors";

const PATTERNS = {
  dots: "radial-gradient(#5e4c3b26 1px, transparent 1px)",
  gingham:
    "repeating-linear-gradient(0deg, #ffffff30 0 12%, transparent 12% 24%), repeating-linear-gradient(90deg, #5e4c3b14 0 12%, transparent 12% 24%)",
  pinstripe:
    "repeating-linear-gradient(135deg, transparent 0 9%, #5e4c3b30 9% 12%, transparent 12% 21%)",
  weave:
    "repeating-linear-gradient(0deg, #5e4c3b20 0 1px, transparent 1px 4px), repeating-linear-gradient(90deg, #ffffff55 0 1px, transparent 1px 4px)",
  runes: undefined,
  sunrise: undefined,
  "magic-circle": undefined,
  shield: undefined,
  crossguard: undefined,
  laurel: undefined,
  compass: undefined,
};

// Shared by the catalog and game so previews always match the equipped skin.
export function NumberTile({ value, tokens }: { value: number; tokens: SkinTokens }) {
  const palette = tokens.tilePalette;
  const background = palette
    ? palette[Math.min(Math.max(Math.log2(value) - 1, 0), palette.length - 1)]
    : tileBg(value);
  const pattern = tokens.tilePattern ? PATTERNS[tokens.tilePattern] : undefined;
  const image = catalogAssetUrl(tokens.tileImagePath);
  const foreground = tokens.character
    ? "#493b40"
    : palette || image
      ? tileTextColor(background)
      : tileFg(value);
  const numberBackground = tokens.character
    ? "#fff9ef"
    : palette || image
      ? background.slice(0, 7)
      : tokens.tilePattern
        ? background
        : undefined;
  const armored = tokens.character === "sentinel" || tokens.character === "runeknight";

  return (
    <span
      aria-hidden="true"
      className="relative grid size-full place-items-center overflow-hidden font-extrabold tracking-tight"
      style={{
        backgroundColor: background,
        backgroundImage: image ? `url("${image}")` : pattern,
        backgroundSize: image ? "cover" : tokens.tilePattern === "dots" ? "22% 22%" : undefined,
        backgroundPosition: "center",
        color: foreground,
        borderRadius: tokens.tileRadius,
      }}
    >
      {tokens.tilePattern === "runes" && (
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 size-full"
          aria-hidden="true"
          fill="none"
          stroke="#5e4c3b66"
          strokeWidth="2"
          strokeLinecap="square"
        >
          <path d="M12 28V10l9 6-9 6m60-10h17l-8 8 8 8M12 72l8 8-8 8m9-16v16m53-8h16m-8-8v16" />
        </svg>
      )}
      {tokens.tilePattern === "sunrise" && (
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 size-full"
          aria-hidden="true"
          focusable="false"
          fill="none"
          stroke="#6b492b80"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M29 24a21 21 0 0 1 42 0M20 24h60M50 4v7M19 9l7 7M81 9l-7 7M11 37h8M81 37h8M12 78h76M25 86h50" />
        </svg>
      )}
      {tokens.tilePattern === "magic-circle" && (
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 size-full"
          aria-hidden="true"
          focusable="false"
          fill="none"
          stroke="#385b5680"
          strokeWidth="2"
        >
          <circle cx="50" cy="50" r="40" />
          <path d="m50 7 6 8-6 8-6-8Zm0 70 6 8-6 8-6-8ZM7 50l8-6 8 6-8 6Zm70 0 8-6 8 6-8 6ZM14 27V14h13m46 0h13v13M14 73v13h13m46 0h13V73" />
        </svg>
      )}
      {tokens.tilePattern === "shield" && (
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 size-full"
          aria-hidden="true"
          focusable="false"
          fill="none"
          stroke="#79523880"
          strokeWidth="2"
          strokeLinejoin="round"
        >
          <path d="M16 13h68v45q0 21-34 31-34-10-34-31Zm8 8h52v35q0 16-26 25-26-9-26-25Z" />
          <path d="M33 14v9m34-9v9M17 37h8m50 0h8" />
          <circle cx="27" cy="30" r="2" />
          <circle cx="73" cy="30" r="2" />
        </svg>
      )}
      {tokens.tilePattern === "crossguard" && (
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 size-full"
          aria-hidden="true"
          focusable="false"
          fill="none"
          stroke="#475c7280"
          strokeWidth="2"
          strokeLinejoin="round"
        >
          <path d="m17 11 11 6 49 60-7 6L18 23Zm66 0-11 6-49 60 7 6 52-60ZM16 70l16 14m36 0 16-14M13 90l9-10m56 0 9 10M39 11h22m-22 78h22" />
        </svg>
      )}
      {tokens.tilePattern === "laurel" && (
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 size-full"
          aria-hidden="true"
          focusable="false"
          fill="none"
          stroke="#8d6c2780"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M35 87Q6 67 18 37m47 50q29-20 17-50M16 49l-8-9m6 22-8-5m13 18-9-3m17 11-8 1m65-35 8-9m-6 22 8-5M81 75l9-3m-17 11 8 1" />
          <circle cx="50" cy="17" r="8" />
          <path d="M50 3v3m0 22v3M36 17h3m22 0h3M40 7l2 2m16 16 2 2M40 27l2-2M58 9l2-2" />
        </svg>
      )}
      {tokens.tilePattern === "compass" && (
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 size-full"
          aria-hidden="true"
          focusable="false"
          fill="none"
          stroke="#376b6980"
          strokeWidth="2"
          strokeLinejoin="round"
        >
          <path d="m50 7 7 12-7 12-7-12Zm0 62 7 12-7 12-7-12ZM27 29 9 20l3 12 17 9M25 43l-10-3 4 10 9 5m45-26 18-9-3 12-17 9m4 2 10-3-4 10-9 5M12 67l7-7 7 7-7 7Zm62 0 7-7 7 7-7 7Z" />
        </svg>
      )}
      {tokens.character && (
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 size-full"
          fill="none"
          aria-hidden="true"
          focusable="false"
        >
          {tokens.character === "fox" ? (
            <>
              <path
                d="m12 45-3-37 29 19h24L91 8l-3 37-12 42H24Z"
                fill="#7f9ec8"
                stroke="#31496e"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <path d="m17 17 15 14-12 8Zm66 0-15 14 12 8Z" fill="#d7f1ff" />
              <path
                d="m14 42 20 7 16-11 16 11 20-7-7 40-29 14-29-14Z"
                fill="#f5f6f3"
                stroke="#6686af"
                strokeWidth="2"
              />
              <path
                d="m27 38 11 3m24 0 11-3"
                stroke="#273b5f"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <path d="m52 10-8 15h8l-4 12 12-17h-9Z" fill="#ffe6a3" stroke="#967940" />
            </>
          ) : tokens.character === "dragon" ? (
            <>
              <path
                d="m20 35-9-25 23 12m32 0 23-12-9 25"
                fill="#f0d596"
                stroke="#72603b"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <path
                d="m13 39-9 7 8 9-7 9 10 8m72-33 9 7-8 9 7 9-10 8"
                fill="#79aa92"
                stroke="#365d51"
                strokeWidth="2"
              />
              <rect
                x="13"
                y="22"
                width="74"
                height="71"
                rx="22"
                fill="#88b89b"
                stroke="#365d51"
                strokeWidth="2"
              />
              <path d="m50 15 9 13-9 12-9-12Z" fill="#f9df9e" stroke="#917344" strokeWidth="2" />
              <path
                d="m24 38 12 4m28 0 12-4"
                stroke="#284a43"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <rect x="20" y="49" width="60" height="38" rx="13" fill="#f8edcc" />
              <path d="M28 29v4m44-4v4" stroke="#f7e7ac" strokeWidth="3" />
            </>
          ) : tokens.character === "phoenix" ? (
            <>
              <path
                d="m20 46-15-28 22 10L36 8l14 15L64 8l9 20 22-10-15 28"
                fill="#d99b76"
                stroke="#795578"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <path
                d="M50 22C29 20 13 35 13 57v18q37 36 74 0V57C87 35 71 20 50 22Z"
                fill="#b58ac5"
                stroke="#674a7e"
                strokeWidth="2"
              />
              <path d="m18 49 18-4 14 10 14-10 18 4-6 32-26 13-26-13Z" fill="#fff0d5" />
              <path
                d="m26 37 12 5m24 0 12-5"
                stroke="#4d365e"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <path d="m50 7 4 11 11 4-11 4-4 11-4-11-11-4 11-4Z" fill="#ffe4a0" stroke="#9d784e" />
              <path d="m45 45 5 7 5-7" fill="#d69b5f" />
            </>
          ) : tokens.character === "diamond" ? (
            <>
              <path
                d="m50 3 22 12 18 25-15 35H25L10 40l18-25Z"
                fill="#b8e3ed"
                stroke="#335d7b"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <path d="m28 15 22-12 22 12-8 25H36Z" fill="#edfaff" />
              <path d="m10 40 18-25 8 25-11 35Z" fill="#73aecb" />
              <path d="m90 40-18-25-8 25 11 35Z" fill="#82bacf" />
              <path d="m36 40 14-22 14 22-14 35Z" fill="#c1d3f1" />
              <path d="M10 40h80M28 15h44M36 40l14 35 14-35" stroke="#477a96" strokeWidth="1.5" />
              <path
                d="m17 51 33-5 33 5v31L68 94H32L17 82Z"
                fill="#f5faff"
                stroke="#668ba7"
                strokeWidth="2"
              />
              <path d="m50 7 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" fill="#fff" />
            </>
          ) : tokens.character === "crown" ? (
            <>
              <path
                d="M13 35q37-19 74 0v38q0 14-37 24-37-10-37-24Z"
                fill="#68527f"
                stroke="#3d3153"
                strokeWidth="2"
              />
              <path
                d="m14 16 19 15L50 6l17 25 19-15-7 30H21Z"
                fill="#e5bc65"
                stroke="#795c35"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <path d="M24 38h52" stroke="#fff0b8" strokeWidth="3" strokeLinecap="round" />
              <path d="m50 17 5 7-5 7-5-7Z" fill="#8b68a5" />
              <circle cx="17" cy="15" r="3" fill="#f7dfa0" />
              <circle cx="83" cy="15" r="3" fill="#f7dfa0" />
              <path
                d="m20 53 30-7 30 7v29l-30 9-30-9Z"
                fill="#fff8e7"
                stroke="#ac8a50"
                strokeWidth="2"
              />
              <path
                d="M11 56 6 63l7 5m74 0 7-5-5-7"
                stroke="#e5bc65"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          ) : armored ? (
            <>
              <path
                d="m9 29 12-17h58l12 17v51L79 94H21L9 80Z"
                fill="#33434e"
                stroke="#202d38"
                strokeWidth="2"
              />
              <path d="m14 29 12-12h48l12 12-12 13H26Z" fill="#8097a4" />
              <path d="m23 28 13-6h28l13 6-8 14H31Z" fill="#182b37" />
              <path
                d="M31 32h38"
                stroke={tokens.character === "sentinel" ? "#8af1ed" : "#f6d38d"}
                strokeWidth="5"
              />
              {tokens.character === "runeknight" ? (
                <path d="m50 4 9 12-9 13-9-13Z" fill="#f3d298" stroke="#6c5439" strokeWidth="2" />
              ) : (
                <path d="M7 40V23m86 17V23M43 12V7h14v5" stroke="#bfdce1" strokeWidth="4" />
              )}
              <path
                d="m9 49 9-6h64l9 6v32l-9 9H18l-9-9Z"
                fill="#edf0e8"
                stroke="#82959b"
                strokeWidth="2"
              />
              <path
                d="M10 52v18m80-18v18"
                stroke={tokens.character === "sentinel" ? "#8af1ed" : "#f6d38d"}
                strokeWidth="3"
              />
            </>
          ) : (
            <>
              {tokens.character === "cat" ? (
                <>
                  <path
                    d="M12 38V12Q12 5 19 10L34 22Q50 16 66 22L81 10Q88 5 88 12V38"
                    fill="#fff7e9"
                    stroke="#8b6555"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                  <path d="m19 18 12 9-12 8Zm62 0-12 9 12 8Z" fill="#e9a2a0" />
                </>
              ) : tokens.character === "bunny" ? (
                <>
                  <path
                    d="M23 31Q9 0 26 4Q37 6 39 29M61 29Q63 6 74 4Q91 0 77 31"
                    fill="#fff7f0"
                    stroke="#8b6555"
                    strokeWidth="2"
                  />
                  <path
                    d="m25 13 6 14m44-14-6 14"
                    stroke="#e9a2ba"
                    strokeWidth="6"
                    strokeLinecap="round"
                  />
                </>
              ) : (
                <path
                  d="m50 3 33 27 11 53-20 11H26L6 83l11-53Z"
                  fill="#4c446a"
                  stroke="#302941"
                  strokeWidth="2"
                />
              )}
              <rect
                x="9"
                y="24"
                width="82"
                height="70"
                rx="25"
                fill="#fff9ef"
                stroke="#8b6555"
                strokeWidth="2"
              />
              {tokens.character === "arcanist" ? (
                <>
                  <path
                    d="m15 32 35-24 35 24-11 16H26Z"
                    fill="#574b79"
                    stroke="#302941"
                    strokeWidth="2"
                  />
                  <path d="m50 12 4 8 8 4-8 4-4 8-4-8-8-4 8-4Z" fill="#e9d49d" />
                  <path d="M30 37h9m22 0h9" stroke="#d0edf0" strokeWidth="3" />
                </>
              ) : (
                <>
                  <ellipse cx="25" cy="46" rx="7" ry="4" fill="#f2b7b0" />
                  <ellipse cx="75" cy="46" rx="7" ry="4" fill="#f2b7b0" />
                  <path
                    d="M34 37v3m32-3v3"
                    stroke="#624636"
                    strokeWidth="4"
                    strokeLinecap="round"
                  />
                  <path
                    d="m47 41 3 2 3-2m-3 2v3m-5-1q2 4 5 1 3 3 5-1"
                    stroke="#624636"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </>
              )}
            </>
          )}
        </svg>
      )}
      <span
        className={
          tokens.character
            ? "absolute inset-x-[10%] top-[48%] bottom-[10%] flex items-center justify-center leading-none"
            : "relative rounded-sm px-[6%] leading-tight"
        }
        style={{
          backgroundColor: numberBackground,
          color: foreground,
          fontSize: tokens.character && value >= 128 ? ".86em" : undefined,
        }}
      >
        {value}
      </span>
    </span>
  );
}
