import { UserRound } from "lucide-react";
import { DEFAULT_PROFILE_ICON, isProfileIconId, type PlayerIconId } from "schema/profile-icons";

export function ProfileIcon({ iconId, className = "size-10" }: { iconId: PlayerIconId; className?: string }) {
  if (iconId === "guest") return <span aria-hidden="true" data-profile-icon="guest" className={`grid shrink-0 place-items-center rounded-full bg-stone-200 text-stone-500 ${className}`}><UserRound className="size-3/5" strokeWidth={1.5} /></span>;
  const id = isProfileIconId(iconId) ? iconId : DEFAULT_PROFILE_ICON;
  // Static, same-origin portraits are shared by the picker, account menu and match intro.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/profile-icons/${id}.svg`} alt="" aria-hidden="true" width={160} height={160} className={`shrink-0 rounded-full ${className}`} draggable={false} data-profile-icon={id} />;
}
