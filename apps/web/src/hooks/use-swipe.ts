
import { Dir } from "@/types";
import { useEffect } from "react";

export function useSwipe(onDir: (d: Dir) => void) {
  useEffect(() => {
    let sx = 0, sy = 0, ex = 0, ey = 0;
    const min = 24;
    const onStart = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      sx = t.clientX; sy = t.clientY;
    };
    const onEnd = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      ex = t.clientX; ey = t.clientY;
      const dx = ex - sx, dy = ey - sy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < min) return;
      if (Math.abs(dx) > Math.abs(dy)) onDir(dx > 0 ? "right" : "left");
      else onDir(dy > 0 ? "down" : "up");
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
    };
  }, [onDir]);
}