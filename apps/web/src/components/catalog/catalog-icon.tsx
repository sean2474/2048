import { UserRound } from "lucide-react";
import { catalogAssetUrl } from "@/lib/catalog-assets";

export function CatalogIcon({ icon, className = "size-10" }: { icon: { id: string; imagePath?: string }; className?: string }) {
  if (icon.id === "guest") return <span aria-hidden="true" data-profile-icon="guest" className={`grid shrink-0 place-items-center rounded-full bg-stone-200 text-stone-500 ${className}`}><UserRound className="size-3/5" strokeWidth={1.5} /></span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={catalogAssetUrl(icon.imagePath) ?? "/profile-icons/fox.svg"} alt="" aria-hidden="true" width={160} height={160} className={`shrink-0 rounded-full ${className}`} draggable={false} data-profile-icon={icon.id} />;
}
