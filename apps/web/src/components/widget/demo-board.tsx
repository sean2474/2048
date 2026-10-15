"use client";
import { useState } from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "ui/i18n";
import "@/styles/duel-preview.css";

export function DemoBoard() {
  const { t } = useI18n();
  const [paused, setPaused] = useState(false);

  return <div className="duel-preview" data-paused={paused}>
    <div role="img" aria-label={t("Two number tiles trading X blocks and hard blocks in a playful duel")} className="relative isolate aspect-[4/3] overflow-hidden rounded-2xl border border-[#d3cbbb] bg-[#eee8db]">
      <div aria-hidden="true" className="absolute inset-4 rounded-xl border border-[#d3cbbb] sm:inset-5" />
      <div aria-hidden="true" className="absolute inset-x-0 top-[13%] text-center text-xs font-bold uppercase tracking-[0.24em] text-[#776e65]">2048 DUO</div>
      <div aria-hidden="true" className="absolute left-[12%] top-[34%] aspect-square w-[27%]">
        <div className="duel-motion duel-tile-left grid size-full place-items-center rounded-[14%] border-b-[6px] border-[#cfad4b] bg-[#edcc61] text-[9cqw] font-extrabold leading-none tracking-tight text-[#77602b] shadow-lg">256</div>
      </div>
      <div aria-hidden="true" className="absolute right-[12%] top-[34%] aspect-square w-[27%]">
        <div className="duel-motion duel-tile-right grid size-full place-items-center rounded-[14%] border-b-[6px] border-[#ccaa3e] bg-[#edc850] text-[9cqw] font-extrabold leading-none tracking-tight text-[#77602b] shadow-lg">512</div>
      </div>
      <span aria-hidden="true" className="absolute inset-x-0 top-[47%] text-center text-[4cqw] font-black italic text-[#776e65]">VS</span>
      <div aria-hidden="true" className="duel-motion duel-projectile-x absolute left-[30%] top-[47%] z-10 grid aspect-square w-[9%] place-items-center rounded-md border-[3px] border-red-600 bg-[#ff6b6b] text-[5cqw] font-black leading-none text-white opacity-0">✖</div>
      <div aria-hidden="true" className="duel-motion duel-projectile-hard absolute right-[30%] top-[47%] z-10 aspect-square w-[9%] rounded-md border-[3px] border-gray-900 bg-[#2c2c2c] opacity-0" />
      <span aria-hidden="true" className="duel-motion duel-spark absolute right-[14%] top-[27%] text-[8cqw] leading-none text-primary opacity-0">✦</span>
      <span aria-hidden="true" className="duel-motion duel-spark duel-spark-left absolute left-[14%] top-[27%] text-[8cqw] leading-none text-primary opacity-0">✦</span>
      <div aria-hidden="true" className="absolute bottom-[14%] left-[20%] h-1 w-[60%] rounded-full bg-[#d3cbbb]" />
    </div>
    <div className="mt-2 flex min-h-11 items-center justify-end gap-2 text-xs text-muted-foreground">
      <Button variant="ghost" size="sm" className="motion-reduce:hidden" onClick={() => setPaused(value => !value)} aria-label={t(paused ? "Play duel animation" : "Pause duel animation")}>
        {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}{t(paused ? "Play" : "Pause")}
      </Button>
      <span className="hidden motion-reduce:inline">{t("Motion off")}</span>
    </div>
  </div>;
}
