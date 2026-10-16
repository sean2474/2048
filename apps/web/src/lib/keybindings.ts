export const KEY_ACTIONS = ["up", "down", "left", "right", "xblock", "hardblock", "ability"] as const;
export type KeyAction = (typeof KEY_ACTIONS)[number];
export type Keybindings = Record<KeyAction, string>;

export const DEFAULT_KEYBINDINGS: Readonly<Keybindings> = Object.freeze({
  up: "KeyW",
  down: "KeyS",
  left: "KeyA",
  right: "KeyD",
  xblock: "Digit1",
  hardblock: "Digit2",
  ability: "Digit3",
});
export const KEYBINDINGS_STORAGE_KEY = "duo.keybindings.v1";

type KeyEvent = Pick<KeyboardEvent, "code" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "isComposing" | "repeat" | "defaultPrevented">;

export function isBindingCode(value: unknown): value is string {
  return typeof value === "string" && /^(Key[A-Z]|Digit[0-9])$/.test(value);
}

export function isKeybindings(value: unknown): value is Keybindings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return entries.length === KEY_ACTIONS.length
    && KEY_ACTIONS.every(action => Object.hasOwn(value, action))
    && entries.every(([, code]) => isBindingCode(code))
    && new Set(entries.map(([, code]) => code)).size === KEY_ACTIONS.length;
}

export function upgradeKeybindings(value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value) && !Object.hasOwn(value, "ability") && Object.keys(value).length === 6) {
    const ability = [3, 4, 5, 6, 7, 8, 9, 0, 1, 2].map(digit => `Digit${digit}`).find(code => !Object.values(value).includes(code));
    const upgraded = { ...value, ability };
    if (isKeybindings(upgraded)) return upgraded;
  }
  return value;
}

export function parseKeybindings(raw: string | null): Keybindings {
  try {
    const value = upgradeKeybindings(raw === null ? null : JSON.parse(raw));
    if (isKeybindings(value)) return value;
  } catch {
    // A damaged browser preference must not disable game controls.
  }
  return { ...DEFAULT_KEYBINDINGS };
}

export function keyLabel(code: string): string {
  return code.replace(/^(Key|Digit)/, "");
}

export function bindingCodeFromEvent(event: KeyEvent): string | null {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing || event.defaultPrevented) return null;
  return isBindingCode(event.code) ? event.code : null;
}

export function resolveKeyAction(event: KeyEvent, bindings: Keybindings, characterShortcuts: boolean): KeyAction | null {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing || event.defaultPrevented) return null;
  const arrows: Record<string, KeyAction> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
  if (Object.hasOwn(arrows, event.code)) return arrows[event.code];
  if (!characterShortcuts) return null;
  const action = KEY_ACTIONS.find(candidate => bindings[candidate] === event.code) ?? null;
  return event.repeat && (action === "xblock" || action === "hardblock" || action === "ability") ? null : action;
}
