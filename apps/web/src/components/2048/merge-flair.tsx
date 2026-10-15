import type { SkinTokens } from "schema/loadout";

/** Edge-only artwork shared by the live tile and the skin detail preview. */
export function MergeFlair({ character }: { character: NonNullable<SkinTokens["character"]> }) {
  return <svg className="legendary-merge-flair" viewBox="0 0 100 100" fill="none" aria-hidden="true" focusable="false">
    {character === "cat" && <g fill="currentColor" stroke="none">
      <path d="M9 26c-7 0-8 9-4 10 2 1 3-1 4-1s2 2 4 1c4-1 3-10-4-10Zm82 0c-7 0-8 9-4 10 2 1 3-1 4-1s2 2 4 1c4-1 3-10-4-10Z" />
      <ellipse cx="2" cy="23" rx="2" ry="3" /><ellipse cx="8" cy="20" rx="2" ry="3" /><ellipse cx="14" cy="22" rx="2" ry="3" />
      <ellipse cx="85" cy="22" rx="2" ry="3" /><ellipse cx="91" cy="20" rx="2" ry="3" /><ellipse cx="97" cy="23" rx="2" ry="3" />
    </g>}
    {character === "bunny" && <>
      <path d="M8 30Q-2 15 9 10q10 10-1 20ZM92 30q10-15-1-20-10 10 1 20ZM19 87Q2 84 8 73q14-1 11 14Zm62 0q17-3 11-14-14-1-11 14Z" />
      <path d="m46 8 4-5 4 5m-8 0 4 5 4-5" />
    </>}
    {character === "sentinel" && <>
      <path d="M7 30V9h21M72 9h21v21M7 70v21h21m44 0h21V70" strokeWidth="3" />
      <path d="M2 45v10m96-10v10M45 2h10m-10 96h10" />
    </>}
    {character === "runeknight" && <>
      <path d="m50 2 48 48-48 48L2 50Z" />
      <path d="m50 5 5 7-5 7-5-7Zm0 76 5 7-5 7-5-7ZM5 50l7-5 7 5-7 5Zm76 0 7-5 7 5-7 5Z" fill="currentColor" stroke="none" />
    </>}
    {character === "arcanist" && <>
      <circle cx="50" cy="50" r="43" /><circle cx="50" cy="50" r="48" strokeDasharray="2 7" />
      <path d="m50 0 2 5 5 2-5 2-2 5-2-5-5-2 5-2Zm0 86 2 5 5 2-5 2-2 5-2-5-5-2 5-2ZM0 50l5-2 2-5 2 5 5 2-5 2-2 5-2-5Zm86 0 5-2 2-5 2 5 5 2-5 2-2 5-2-5Z" fill="currentColor" stroke="none" />
    </>}
  </svg>;
}
