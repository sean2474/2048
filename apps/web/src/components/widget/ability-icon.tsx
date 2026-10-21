import type { AbilityId } from "schema/loadout";

export function AbilityIcon({
  abilityId,
  className = "size-10",
}: {
  abilityId: AbilityId;
  className?: string;
}) {
  // Static SVG artwork stays sharp in both the picker and tutorial controls.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/ability-icons/${abilityId}.svg`}
      alt=""
      aria-hidden="true"
      width={64}
      height={64}
      className={`shrink-0 ${className}`}
      draggable={false}
      data-ability-icon={abilityId}
    />
  );
}
