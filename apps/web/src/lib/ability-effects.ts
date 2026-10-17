import { ABILITY_CHARGE, type AbilityState } from "schema/in-game";
import type { AbilityId } from "schema/loadout";

type AbilityCharge = Pick<AbilityState, "id" | "charge">;

export function consumedAbility(previous?: AbilityCharge, current?: AbilityCharge): AbilityId | null {
  return previous && current && previous.id === current.id && previous.charge >= ABILITY_CHARGE && current.charge === 0
    ? current.id : null;
}
