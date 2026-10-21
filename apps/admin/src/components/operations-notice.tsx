"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { AdminOperations } from "schema/admin";
import { useI18n } from "ui/i18n";

export function OperationsNotice() {
  const { t } = useI18n();
  const [label, setLabel] = useState("Checking live server status…");
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/operations", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("unavailable");
        const data = (await response.json()) as AdminOperations;
        const oldest = data.storage?.pending[0];
        const warning =
          !data.storage ||
          data.storage.readErrorAt ||
          data.storage.writeErrorAt ||
          (oldest && Date.parse(data.collectedAt) - Date.parse(oldest.endedAt) > 120000);
        if (!controller.signal.aborted)
          setLabel(
            warning
              ? "Storage needs attention. Open Operations for details."
              : "Live server responded. Open Operations for storage and queue details.",
          );
      } catch {
        if (!controller.signal.aborted)
          setLabel("Live status unavailable. Open Operations for details.");
      }
    })();
    return () => controller.abort();
  }, []);
  return (
    <p className="admin-panel px-5 py-3 text-sm" role="status">
      <Link href="/operations" className="inline-flex min-h-11 items-center text-primary underline">
        {t(label)}
      </Link>
    </p>
  );
}
