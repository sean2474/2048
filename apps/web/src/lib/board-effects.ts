import { ABILITY_CHARGE, type AbilityState, type AttackType, type PublicPlayerState } from "schema/in-game";
import type { AbilityId } from "schema/loadout";

type AbilityCharge = Pick<AbilityState, "id" | "charge">;

export function consumedAbility(previous?: AbilityCharge, current?: AbilityCharge): AbilityId | null {
  return previous && current && previous.id === current.id && previous.charge >= ABILITY_CHARGE && current.charge === 0
    ? current.id : null;
}

export type Side = "you" | "opp";
export type EffectPlayer = Pick<PublicPlayerState, "board" | "attacksSent" | "score"> & Partial<Pick<PublicPlayerState, "ability">>;
export type EffectPlayers = Partial<Record<Side, EffectPlayer>>;
export type BoardEffect = { kind: "ability"; id: AbilityId; owner: Side }
  | { kind: "attack"; id: AttackType; phase: "sent" | "incoming" | "landed"; owner: Side };

export function boardEffects(previous: EffectPlayers | undefined, current: EffectPlayers, side: Side): BoardEffect[] {
  if (!previous) return [];
  const effects: BoardEffect[] = [];
  for (const owner of ["you", "opp"] as const) {
    const before = previous[owner], after = current[owner];
    if (!before || !after || after.score < before.score) continue;
    const ability = consumedAbility(before.ability, after.ability);
    if (ability) {
      const offensive = ability === "frost-wave" || ability === "swap-32";
      const target = offensive ? owner === "you" ? "opp" : "you" : owner;
      if (target === side) effects.push({ kind: "ability", id: ability, owner });
    }
    for (const id of ["xblock", "hardblock"] as const) {
      if ((after.attacksSent?.[id] ?? 0) > (before.attacksSent?.[id] ?? 0)) effects.push({ kind: "attack", id, phase: owner === side ? "sent" : "incoming", owner });
    }
  }
  const before = previous[side]?.board, after = current[side]?.board;
  if (before && after) {
    const known = new Set(before.map(tile => tile.id));
    for (const id of ["xblock", "hardblock"] as const) {
      if (after.some(tile => tile.blockType === id && tile.spawned && !tile.ghost && !known.has(tile.id))) {
        effects.push({ kind: "attack", id, phase: "landed", owner: side === "you" ? "opp" : "you" });
      }
    }
  }
  return effects;
}
