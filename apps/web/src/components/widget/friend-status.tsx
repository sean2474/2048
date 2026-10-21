"use client";

import Link from "next/link";
import { Eye, Swords } from "lucide-react";
import { useI18n } from "ui/i18n";
import type { SocialPlayer } from "schema/social";
import { useFriendChallenges, useFriendPresence } from "@/hooks/friend-presence-provider";
import { Button } from "@/components/ui/button";

export function FriendStatus({ playerId }: { playerId: string }) {
  const { t } = useI18n();
  const presence = useFriendPresence();
  const activity = presence && "friends" in presence ? presence.friends[playerId] : undefined;
  const label =
    activity === "playing"
      ? "In game"
      : activity === "solo"
        ? "Playing solo"
        : activity === "online"
          ? "Online"
          : activity === "offline"
            ? "Offline"
            : presence
              ? "Status unavailable"
              : "Checking status…";
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        aria-hidden="true"
        className={`size-1.5 shrink-0 rounded-full ${activity === "playing" || activity === "solo" ? "bg-amber-600" : activity === "online" ? "bg-emerald-600" : "bg-muted-foreground/50"}`}
      />
      {t(label)}
    </span>
  );
}

export function WatchFriendButton({
  person,
  compact = false,
}: {
  person: SocialPlayer;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const presence = useFriendPresence();
  const enabled = !!presence && "friends" in presence && presence.friends[person.id] === "playing";
  const label = t("Watch {name}", { name: person.name });
  const content = (
    <>
      <Eye aria-hidden="true" className="size-4" />
      {!compact && t("Watch")}
    </>
  );
  const props = {
    variant: compact ? ("ghost" as const) : ("outline" as const),
    size: compact ? ("icon" as const) : ("default" as const),
    className: compact ? "size-11 shrink-0" : undefined,
  };
  return enabled ? (
    <Button {...props} asChild>
      <Link href={`/watch/${person.id}`} aria-label={label} title={t("Watch")}>
        {content}
      </Link>
    </Button>
  ) : (
    <Button
      {...props}
      disabled
      aria-label={label}
      title={t("Watch is available during a multiplayer match.")}
    >
      {content}
    </Button>
  );
}

export function ChallengeFriendButton({
  person,
  compact = false,
}: {
  person: SocialPlayer;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const presence = useFriendPresence();
  const challenge = useFriendChallenges();
  const enabled =
    !!presence &&
    "friends" in presence &&
    presence.friends[person.id] === "online" &&
    !!challenge &&
    !challenge.pending &&
    !challenge.busy;
  return (
    <Button
      variant={compact ? "ghost" : "outline"}
      size={compact ? "icon" : "default"}
      className={compact ? "size-11 shrink-0" : undefined}
      disabled={!enabled}
      aria-label={t("Challenge {name}", { name: person.name })}
      title={t(
        enabled ? "Challenge to a match" : "Challenge an online friend who is not in a game.",
      )}
      onClick={() => challenge?.send({ t: "send", playerId: person.id })}
    >
      <Swords aria-hidden="true" className="size-4" />
      {!compact && t("Challenge to a match")}
    </Button>
  );
}
