"use client";

import { ratingTier } from "schema/ranking";
import { useI18n } from "ui/i18n";
import { useId } from "react";

type Tier = ReturnType<typeof ratingTier>;

const colors = {
  Bronze: { fill: "#d9ae82", shade: "#94613f", ink: "#62422f", badge: "bg-[#eee3d9] text-[#62422f]" },
  Silver: { fill: "#dce3e9", shade: "#8a9aa9", ink: "#465668", badge: "bg-[#e9edf1] text-[#465668]" },
  Gold: { fill: "#efd58b", shade: "#b78a35", ink: "#78571e", badge: "bg-[#f4ecd5] text-[#78571e]" },
  Platinum: { fill: "#b5dcd1", shade: "#5c958a", ink: "#34665c", badge: "bg-[#e1ece7] text-[#34665c]" },
  Diamond: { fill: "#b9ddf3", shade: "#4b94bf", ink: "#2e6185", badge: "bg-[#e1ecf5] text-[#2e6185]" },
  Master: { fill: "#d7c5ed", shade: "#9273b7", ink: "#63477d", badge: "bg-[#ebe4f2] text-[#63477d]" },
} satisfies Record<Tier, { fill: string; shade: string; ink: string; badge: string }>;

/** Decorative companion to the visible, translated tier name. */
export function TierIcon({ tier, className = "size-10" }: { tier: Tier; className?: string }) {
  const color = colors[tier];
  const metal = useId();
  const advanced = tier === "Platinum" || tier === "Diamond" || tier === "Master";
  return <svg viewBox="0 0 80 80" fill="none" aria-hidden="true" focusable="false" className={`shrink-0 ${className}`}>
    <defs><linearGradient id={metal} x1="18" y1="12" x2="62" y2="70" gradientUnits="userSpaceOnUse"><stop stopColor={color.fill} /><stop offset=".45" stopColor={color.fill} /><stop offset=".5" stopColor={color.shade} /><stop offset="1" stopColor={color.ink} /></linearGradient></defs>
    {advanced && <g fill={`url(#${metal})`} stroke={color.ink} strokeWidth="1.3" strokeLinejoin="round">
      <path d="M23 28 5 20l4 15 14 8M22 40 8 34l5 15 11 6M57 28l18-8-4 15-14 8m1-3 14-6-5 15-11 6" />
    </g>}
    <path d="m40 9 24 12v24c0 13-13 23-24 29-11-6-24-16-24-29V21Z" fill={`url(#${metal})`} stroke={color.ink} strokeWidth="1.5" strokeLinejoin="round" />
    <path d="m40 15 19 9v21c0 10-10 19-19 24-9-5-19-14-19-24V24Z" stroke={color.fill} strokeWidth="1.2" />
    <path d="m40 21 14 6v17c0 8-7 15-14 20-7-5-14-12-14-20V27Z" fill={color.ink} opacity=".85" />
    {tier === "Bronze" && <path d="m30 39 10-8 10 8v7l-10-8-10 8Z" fill={color.fill} />}
    {tier === "Silver" && <g stroke={color.fill} strokeWidth="3.5" strokeLinejoin="miter"><path d="m30 36 10-8 10 8m-20 11 10-8 10 8" /></g>}
    {tier === "Gold" && <path d="m40 28 4 9 10 1-8 7 2 10-8-5-8 5 2-10-8-7 10-1Z" fill={color.fill} />}
    {advanced && <>
      <path d="m40 26 12 15-12 17-12-17Z" fill={color.fill} />
      <path d="m40 26 1 15 11 0-12 17Z" fill={color.shade} />
      <path d="m40 26-12 15h13Z" fill="#ffffff" opacity=".45" />
    </>}
    {tier === "Diamond" && <path d="m40 3 5 6-5 7-5-7Z" fill={color.fill} stroke={color.ink} strokeWidth="1.2" />}
    {tier === "Master" && <g fill="#d9b96f" stroke="#7c6234" strokeWidth="1.3" strokeLinejoin="round"><path d="m27 8 7 5 6-10 6 10 7-5-3 14H30Z" /><path d="M31 18h18" /></g>}
  </svg>;
}

export function TierBadge({ rating, className = "" }: { rating: number; className?: string }) {
  const { t } = useI18n();
  const tier = ratingTier(rating);
  return <span className={`inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-lg py-0.5 pr-2.5 pl-1 text-xs font-bold ${colors[tier].badge} ${className}`}>
    <TierIcon tier={tier} className="size-8" />{t(tier)}
  </span>;
}
