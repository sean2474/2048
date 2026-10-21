"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useI18n } from "ui/i18n";
import { Button } from "ui/button";
export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { t } = useI18n();
  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      aria-busy={pending}
      onClick={() => startTransition(() => router.refresh())}
    >
      {t("Refresh")}
    </Button>
  );
}
