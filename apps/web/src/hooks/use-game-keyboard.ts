"use client";

import { useEffect, useRef, type RefObject } from "react";
import {
  createMovementRepeater,
  resolveKeyAction,
  type KeyAction,
  type Keybindings,
} from "@/lib/keybindings";

export function useGameKeyboard({
  enabled,
  bindings,
  characterShortcuts,
  onAction,
  target,
}: {
  enabled: boolean;
  bindings: Keybindings;
  characterShortcuts: boolean;
  onAction: (action: KeyAction) => void;
  target?: RefObject<HTMLElement | null>;
}) {
  const actionRef = useRef(onAction);
  useEffect(() => {
    actionRef.current = onAction;
  }, [onAction]);

  useEffect(() => {
    if (!enabled) return;
    const movement = createMovementRepeater((direction) => actionRef.current(direction));
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        target?.current &&
        !(event.target instanceof Node && target.current.contains(event.target))
      )
        return;
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.isComposing ||
        event.defaultPrevented ||
        (event.target instanceof HTMLElement &&
          event.target.closest(
            "input, textarea, select, [contenteditable=true], [role=dialog], [role=alertdialog], [role=menu]",
          ))
      ) {
        movement.stop();
        return;
      }
      const action = resolveKeyAction(event, bindings, characterShortcuts);
      if (!action) return;
      event.preventDefault();
      if (event.repeat) return;
      if (action === "ability") actionRef.current(action);
      else movement.press(event.code, action);
    };
    const onKeyUp = (event: KeyboardEvent) => movement.release(event.code);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", movement.stop);
    window.addEventListener("focusin", movement.stop);
    window.addEventListener("compositionstart", movement.stop);
    document.addEventListener("visibilitychange", movement.stop);
    return () => {
      movement.stop();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", movement.stop);
      window.removeEventListener("focusin", movement.stop);
      window.removeEventListener("compositionstart", movement.stop);
      document.removeEventListener("visibilitychange", movement.stop);
    };
  }, [enabled, bindings, characterShortcuts, target]);
}
