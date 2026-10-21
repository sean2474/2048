"use client";

import { useCallback } from "react";
import Link from "next/link";
import { MessageCircle, UserPlus, Users } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SocialPlayer } from "schema/social";
import { useI18n } from "ui/i18n";
import { useLiveQuery } from "@/hooks/use-live-query";
import { Button } from "@/components/ui/button";
import { ProfileIcon } from "./profile-icon";
import { ChallengeFriendButton, FriendStatus, WatchFriendButton } from "./friend-status";

export function FriendsSummary({ userId }: { userId: string | null | undefined }) {
  const { t } = useI18n();
  const load = useCallback(
    async (client: SupabaseClient) => {
      if (!userId) return [];
      const { data, error } = await client.rpc("social_players");
      if (error) throw error;
      return (data ?? []) as SocialPlayer[];
    },
    [userId],
  );
  const contacts = useLiveQuery({
    table: ["friendships", "direct_messages"],
    enabled: !!userId,
    load,
  });
  const friends = contacts.data.filter((person) => person.relationship === "friend");
  const incoming = contacts.data.filter((person) => person.relationship === "incoming").length;

  return (
    <section aria-labelledby="dashboard-friends-title" className="game-panel min-w-0 bg-card p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 id="dashboard-friends-title" className="flex items-center gap-2 text-lg font-bold">
          <Users aria-hidden="true" className="size-5" />
          {t("My friends")}
        </h2>
        {userId && !contacts.loading && !contacts.error && (
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold tabular-nums">
            {friends.length}
          </span>
        )}
      </div>
      {userId === undefined || (userId && contacts.loading) ? (
        <p role="status" className="py-6 text-sm text-muted-foreground">
          {t("Loading friends…")}
        </p>
      ) : !userId ? (
        <div className="space-y-4">
          <p className="text-sm leading-6 text-muted-foreground">
            {t("Sign in to add friends, send messages, and spectate.")}
          </p>
          <Button asChild variant="outline" className="w-full">
            <Link href="/login">{t("Login")}</Link>
          </Button>
        </div>
      ) : (
        <>
          {contacts.error ? (
            <div role="alert" className="space-y-3 py-4 text-sm">
              <p className="text-destructive">{contacts.error}</p>
              <Button variant="outline" onClick={contacts.reload}>
                {t("Retry friends")}
              </Button>
            </div>
          ) : (
            <>
              {incoming > 0 && (
                <Link
                  href="/friends"
                  className="mb-3 flex min-h-11 items-center rounded-lg bg-accent px-3 text-sm font-semibold text-accent-foreground hover:underline"
                >
                  {t("{count} friend requests", { count: incoming })}
                </Link>
              )}
              {!friends.length ? (
                <div className="rounded-xl border border-dashed px-4 py-6 text-center">
                  <Users aria-hidden="true" className="mx-auto mb-3 size-7 text-muted-foreground" />
                  <p className="text-sm font-semibold">{t("No friends yet.")}</p>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {t("Find a player by nickname to add your first friend.")}
                  </p>
                </div>
              ) : (
                <ul className="divide-y">
                  {friends.slice(0, 5).map((person) => (
                    <li key={person.id} className="flex items-center gap-2 py-3">
                      <ProfileIcon iconId={person.icon_id} className="size-10 shrink-0" />
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="truncate text-sm font-semibold" title={person.name}>
                          {person.name}
                        </p>
                        <FriendStatus playerId={person.id} />
                      </div>
                      <Button
                        asChild
                        variant="ghost"
                        size="icon"
                        className="relative size-11 shrink-0"
                      >
                        <Link
                          href={`/friends?chat=${person.id}`}
                          aria-label={t("Message {name}", { name: person.name })}
                          title={t("Message")}
                        >
                          <MessageCircle aria-hidden="true" className="size-4" />
                          {Number(person.unread) > 0 && (
                            <span
                              aria-label={t("{count} unread messages", { count: person.unread })}
                              className="absolute -right-0.5 -top-0.5 rounded-full bg-primary px-1.5 text-[10px] font-bold leading-4 text-primary-foreground"
                            >
                              {Number(person.unread) > 99 ? "99+" : person.unread}
                            </span>
                          )}
                        </Link>
                      </Button>
                      <WatchFriendButton person={person} compact />
                      <ChallengeFriendButton person={person} compact />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          <Button asChild variant="outline" className="mt-4 w-full">
            <Link href="/friends">
              <UserPlus aria-hidden="true" className="size-4" />
              {t(friends.length ? "View all friends" : "Find friends")}
            </Link>
          </Button>
        </>
      )}
    </section>
  );
}
