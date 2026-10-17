"use client";
import { useI18n } from "ui/i18n";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ProfileIcon } from "./profile-icon";
import { useSettings } from "@/hooks/settings-provider";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
export const UserAvatar = ({ guest = false }: { guest?: boolean }) => {
  const { t } = useI18n();
  const { settings } = useSettings();
  const router = useRouter();
  const [error, setError] = useState("");
  if (guest) return <Link href="/loadout" aria-label={t("My loadout")} className="grid size-11 place-items-center rounded-full border bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><ProfileIcon iconId="guest" className="size-9" /></Link>;
  return <div><DropdownMenu><DropdownMenuTrigger aria-label={t("Account menu")} className="grid size-11 place-items-center rounded-full border bg-card transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><ProfileIcon iconId={settings.iconId} className="size-9" /></DropdownMenuTrigger>
    <DropdownMenuContent side="bottom" align="end"><DropdownMenuItem asChild className="min-h-11"><Link href="/settings">{t("Settings")}</Link></DropdownMenuItem><DropdownMenuItem asChild className="min-h-11"><Link href="/loadout">{t("My loadout")}</Link></DropdownMenuItem><DropdownMenuItem asChild className="min-h-11"><Link href="/achievements">{t("Achievements")}</Link></DropdownMenuItem><DropdownMenuItem asChild className="min-h-11"><Link href="/shop">{t("Coin shop")}</Link></DropdownMenuItem><DropdownMenuItem asChild className="min-h-11"><Link href="/history">{t("Match history")}</Link></DropdownMenuItem><DropdownMenuItem className="min-h-11" onClick={async () => {
      const { error } = await createClient().auth.signOut({ scope: "local" });
      if (error) { setError("Could not log out. Please try again."); return; }
      router.replace("/"); router.refresh();
    }}>{t("Log out")}</DropdownMenuItem></DropdownMenuContent>
  </DropdownMenu>{error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}</div>;
};
