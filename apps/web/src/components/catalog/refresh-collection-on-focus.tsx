"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

export function RefreshCollectionOnFocus() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") startTransition(() => router.refresh()); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [router]);
  return null;
}
