"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useI18n } from "ui/i18n";
import { Button } from "@/components/ui/button";
import { useAudio } from "@/hooks/audio-provider";
import { useLoadout } from "@/hooks/use-loadout";

export function SoundToggle() {
  const { t } = useI18n();
  const { muted, volume, ready, saveAudio } = useAudio();
  const silent = muted || volume === 0;
  return <Button variant="outline" size="sm" disabled={!ready} aria-label={t("Game sound")} aria-pressed={!silent} title={t(silent ? "Turn sound on" : "Mute sound")} onClick={() => saveAudio(silent ? { muted: false, volume: volume || 0.45 } : { muted: true })}>
    {silent ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}{t(silent ? "Sound off" : "Sound on")}
  </Button>;
}

export function AudioSettingsPanel() {
  const { t } = useI18n();
  const { skin } = useLoadout();
  const { volume, muted, ready, storageError, unavailable, saveAudio, play } = useAudio();
  return <section aria-labelledby="audio-title" className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="audio-title" className="flex items-center gap-2 text-lg font-bold"><Volume2 aria-hidden="true" className="size-5 text-primary" />{t("Game sound")}</h2><SoundToggle /></div>
    <p id="audio-help" className="mt-2 text-sm leading-6 text-muted-foreground">{t("Move, merge and battle effects. Audio settings are saved in this browser.")}</p>
    <div className="mt-5 flex items-center justify-between gap-3 text-sm font-semibold"><label htmlFor="audio-volume">{t("Effects volume")}</label><output htmlFor="audio-volume">{Math.round(volume * 100)}%</output></div>
    <input id="audio-volume" type="range" min="0" max="100" step="5" value={Math.round(volume * 100)} disabled={!ready} aria-describedby="audio-help" aria-valuetext={`${Math.round(volume * 100)}%`} onChange={event => saveAudio({ volume: Number(event.target.value) / 100 })} className="min-h-11 w-full accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" />
    <Button variant="outline" size="sm" disabled={!ready || muted || volume === 0} onClick={() => play("merge", skin.id)}>{t("Test sound")}</Button>
    {storageError && <p role="status" className="mt-3 text-xs text-destructive">{t("Audio settings could not be saved. They will last for this visit only.")}</p>}
    {unavailable && <p role="status" className="mt-3 text-xs text-muted-foreground">{t("Audio is unavailable. You can keep playing without sound.")}</p>}
  </section>;
}
