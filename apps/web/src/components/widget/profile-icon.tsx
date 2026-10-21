"use client";

import { UserRound } from "lucide-react";
import { type PlayerIconId } from "schema/profile-icons";
import { useCatalog } from "@/hooks/catalog-provider";
import { catalogAssetUrl } from "@/lib/catalog-assets";

export function ProfileIcon({
  iconId,
  className = "size-10",
}: {
  iconId: PlayerIconId;
  className?: string;
}) {
  const icon = useCatalog().icon(iconId);
  if (iconId === "guest")
    return (
      <span
        aria-hidden="true"
        data-profile-icon="guest"
        className={`grid shrink-0 place-items-center rounded-full bg-stone-200 text-stone-500 ${className}`}
      >
        <UserRound className="size-3/5" strokeWidth={1.5} />
      </span>
    );
  const src = "imagePath" in icon ? catalogAssetUrl(icon.imagePath) : "/profile-icons/fox.svg";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      aria-hidden="true"
      width={160}
      height={160}
      className={`shrink-0 rounded-full ${className}`}
      draggable={false}
      data-profile-icon={icon.id}
    />
  );
}
