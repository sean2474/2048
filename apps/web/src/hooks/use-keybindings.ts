"use client";

import { useSettings } from "./settings-provider";
import type { Keybindings } from "@/lib/keybindings";

export function useKeybindings() {
  const { settings, ready, saving, error, saveSettings } = useSettings();
  return { bindings: settings.keybindings, saveBindings: (keybindings: Keybindings) => saveSettings({ keybindings }), storageError: error, ready, saving };
}
