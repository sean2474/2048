"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import type { SkinId } from "schema/loadout";
import {
  AUDIO_STORAGE_KEY,
  DEFAULT_AUDIO,
  GameAudio,
  parseAudioSettings,
  type AudioSettings,
  type GameSound,
} from "@/lib/game-audio";

import { useCatalog } from "./catalog-provider";

type AudioContextValue = AudioSettings & {
  ready: boolean;
  storageError: boolean;
  unavailable: boolean;
  saveAudio: (patch: Partial<AudioSettings>) => void;
  play: (sound: GameSound, skinId?: SkinId) => void;
};
const Context = createContext<AudioContextValue | null>(null);

export function AudioProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(DEFAULT_AUDIO);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const current = useRef(settings);
  const engine = useRef<GameAudio | null>(null);
  const pathname = usePathname();
  const catalog = useCatalog();
  const catalogRef = useRef(catalog);
  catalogRef.current = catalog;

  useEffect(() => {
    const audio = new GameAudio();
    engine.current = audio;
    try {
      current.current = parseAudioSettings(localStorage.getItem(AUDIO_STORAGE_KEY));
    } catch {
      setStorageError(true);
    }
    audio.setSettings(current.current);
    setSettings(current.current);
    setReady(true);
    let active = true;
    const unlock = () => {
      void audio.unlock().then((ok) => {
        if (active) setUnavailable(!ok);
      });
    };
    const hide = () => {
      if (document.hidden) audio.stop();
    };
    const sync = (event: StorageEvent) => {
      if (event.key !== AUDIO_STORAGE_KEY && event.key !== null) return;
      current.current = parseAudioSettings(event.newValue);
      audio.setSettings(current.current);
      setSettings(current.current);
    };
    window.addEventListener("pointerdown", unlock, true);
    window.addEventListener("pointerup", unlock, true);
    window.addEventListener("keydown", unlock, true);
    window.addEventListener("storage", sync);
    document.addEventListener("visibilitychange", hide);
    return () => {
      active = false;
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("pointerup", unlock, true);
      window.removeEventListener("keydown", unlock, true);
      window.removeEventListener("storage", sync);
      document.removeEventListener("visibilitychange", hide);
      audio.dispose();
      engine.current = null;
    };
  }, []);

  useEffect(() => {
    engine.current?.stop();
  }, [pathname]);
  const play = useCallback((sound: GameSound, skinId?: SkinId) => {
    engine.current?.play(
      sound,
      skinId ? catalogRef.current.skin(skinId).tokens : undefined,
      skinId,
    );
  }, []);
  const saveAudio = useCallback((patch: Partial<AudioSettings>) => {
    const next = parseAudioSettings(JSON.stringify({ ...current.current, ...patch }));
    current.current = next;
    engine.current?.setSettings(next);
    setSettings(next);
    try {
      localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(next));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, []);

  return (
    <Context.Provider value={{ ...settings, ready, storageError, unavailable, saveAudio, play }}>
      {children}
    </Context.Provider>
  );
}

export function useAudio() {
  const value = useContext(Context);
  if (!value) throw new Error("AudioProvider is required");
  return value;
}
