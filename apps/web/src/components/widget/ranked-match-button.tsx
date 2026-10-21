"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { useI18n } from "ui/i18n";
import { usePlayer } from "@/hooks/use-player";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { GameEmblem } from "./game-emblem";

export function RankedMatchButton() {
  const { t } = useI18n();
  const { user } = usePlayer();
  const router = useRouter();
  const [loginRequired, setLoginRequired] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        className="game-menu-link w-full justify-start px-4"
        onClick={() => {
          if (user && !user.is_anonymous) router.push("/play/ranked");
          else setLoginRequired(true);
        }}
      >
        <GameEmblem kind="crown" className="size-10" />
        {t("Ranked match")}
        <ArrowRight aria-hidden="true" className="ml-auto" />
      </Button>
      <Dialog open={loginRequired} onOpenChange={setLoginRequired}>
        <DialogContent className="rounded-2xl sm:max-w-sm">
          <DialogTitle className="pr-6">{t("Ranked match")}</DialogTitle>
          <DialogDescription className="leading-6">
            {t("Sign in to play ranked. Guests can play casual or friend matches.")}
          </DialogDescription>
          <Button asChild>
            <Link href="/login">{t("Log in")}</Link>
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
