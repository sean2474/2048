"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SocialPlayer } from "schema/social";
import { MessageCircle, UserPlus } from "lucide-react";
import { useI18n } from "ui/i18n";
import { usePlayer } from "@/hooks/use-player";
import { useLiveQuery } from "@/hooks/use-live-query";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { PlayerSearch } from "@/components/widget/player-search";
import { ProfileIcon } from "@/components/widget/profile-icon";
import { FriendMessages } from "@/components/widget/friend-messages";
import { ChallengeFriendButton, FriendStatus, WatchFriendButton } from "@/components/widget/friend-status";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export function FriendDirectory({ loading }: { loading: ReactNode }) {
  const { t } = useI18n();
  const { user } = usePlayer();
  const searchParams = useSearchParams();
  const [submitted, setSubmitted] = useState("");
  const targetParam = searchParams.get("player");
  const chatParam = searchParams.get("chat");
  const [target, setTarget] = useState(targetParam);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const signedIn = !!user && !user.is_anonymous;
  const userId = signedIn ? user.id : null;
  useEffect(() => { setTarget(targetParam); setSubmitted(""); }, [targetParam]);
  const loadContacts = useCallback(async (client: SupabaseClient) => {
    if (!userId) return [];
    const { data, error } = await client.rpc("social_players"); if (error) throw error; return data as SocialPlayer[];
  }, [userId]);
  const loadSearch = useCallback(async (client: SupabaseClient) => {
    if (!userId) return [];
    const { data, error } = await client.rpc("social_players", target ? { p_target: target } : { p_query: submitted });
    if (error) throw error; return data as SocialPlayer[];
  }, [submitted, target, userId]);
  const contacts = useLiveQuery({ table: ["friendships", "direct_messages"], enabled: signedIn, load: loadContacts });
  const results = useLiveQuery({ table: "friendships", enabled: signedIn && !!(target || submitted), load: loadSearch });
  const friend = contacts.data.find(person => person.id === selected && person.relationship === "friend");
  useEffect(() => { setSelected(chatParam); setNotice(""); setError(""); }, [user?.id, chatParam]);
  async function action(person: SocialPlayer, kind: "request" | "accept" | "remove") {
    if (busy) return;
    setBusy(true); setNotice(""); setError("");
    try {
      const { error } = await createClient().rpc("friend_action", { p_target: person.id, p_action: kind });
      if (error) throw error;
      setNotice(kind === "request" ? "Friend request sent." : kind === "accept" ? "Friend request accepted." : "Friend connection removed.");
      contacts.reload(); results.reload();
      if (kind === "accept") setSelected(person.id);
      if (kind === "remove" && selected === person.id) setSelected(null);
    } catch (cause) { setError((cause as { code?: string }).code === "54000" ? "Friend list or pending request limit reached." : "Could not update friendship. Please try again."); }
    finally { setBusy(false); }
  }
  const card = (person: SocialPlayer) => <li key={person.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
    <ProfileIcon iconId={person.icon_id} className="size-10" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{person.name}</p>{person.relationship === "friend" ? <FriendStatus playerId={person.id} /> : <p className="text-xs text-muted-foreground">{person.relationship === "incoming" ? t("Wants to be your friend") : person.relationship === "outgoing" ? t("Request pending") : t("Player")}</p>}</div>
    <div className="flex flex-wrap gap-2">
      {person.relationship === "friend" ? <>
        <Button variant={selected === person.id ? "default" : "outline"} onClick={() => setSelected(person.id)} aria-label={t("Message {name}", { name: person.name })}><MessageCircle aria-hidden="true" className="size-4" />{t("Message")}{Number(person.unread)>0 && <span className="rounded-full bg-accent px-1.5 text-xs text-accent-foreground">{person.unread}</span>}</Button>
        <WatchFriendButton person={person} />
        <ChallengeFriendButton person={person} />
        <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" disabled={busy}>{t("Remove friend")}</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t("Remove {name} from friends?", { name: person.name })}</AlertDialogTitle><AlertDialogDescription>{t("You will no longer be able to send messages or watch their private matches.")}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t("Cancel")}</AlertDialogCancel><AlertDialogAction onClick={() => void action(person,"remove")}>{t("Remove friend")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      </> : person.relationship === "incoming" ? <><Button disabled={busy} onClick={() => void action(person,"accept")}>{t("Accept")}</Button><Button variant="ghost" disabled={busy} onClick={() => void action(person,"remove")}>{t("Decline")}</Button></>
        : person.relationship === "outgoing" ? <Button variant="ghost" disabled={busy} onClick={() => void action(person,"remove")}>{t("Cancel request")}</Button>
        : <Button disabled={busy} onClick={() => void action(person,"request")}><UserPlus aria-hidden="true" className="size-4" />{t("Add friend")}</Button>}
    </div>
  </li>;
  return <div className="space-y-6">

    {user === undefined ? <p role="status">{t("Loading…")}</p> : !signedIn ? <div className="space-y-4 rounded-2xl border bg-card p-6"><p>{t("Sign in to add friends, send messages, and spectate.")}</p><Button asChild><Link href="/login">{t("Login")}</Link></Button></div> : <>
      <PlayerSearch key={`${userId}:${targetParam ?? ""}`} onSearch={query => { setTarget(null); setSubmitted(query); }} onSelect={id => { setSubmitted(""); setTarget(id); }} />
      {notice && <p role="status" className="text-sm text-primary">{t(notice)}</p>}{error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}
      {(submitted || target) && <section className="space-y-3"><div className="flex items-center justify-between"><h2 className="font-bold">{t("Search results")}</h2><Button variant="ghost" onClick={() => { setSubmitted(""); setTarget(null); }}>{t("Close")}</Button></div>{results.loading ? <p role="status">{t("Searching…")}</p> : results.error ? <p role="alert" className="text-sm text-destructive">{results.error}</p> : !results.data.length ? <p className="text-sm text-muted-foreground">{t("No players found.")}</p> : <ul className="space-y-2">{results.data.map(card)}</ul>}</section>}
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section className="min-w-0 space-y-4"><h2 className="font-bold">{t("My friends")} <span className="text-sm text-muted-foreground">{contacts.data.filter(person=>person.relationship==="friend").length}</span></h2>
          {contacts.error && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{contacts.error}</p><Button variant="outline" onClick={contacts.reload}>{t("Try again")}</Button></div>}
          {contacts.loading ? loading : !contacts.error && !contacts.data.length ? <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">{t("Search for a player above to send your first friend request.")}</p> : <ul className="space-y-3">{[...contacts.data].sort((a,b)=>(a.relationship==="incoming"?0:a.relationship==="friend"?1:2)-(b.relationship==="incoming"?0:b.relationship==="friend"?1:2)).map(card)}</ul>}
          <p className="text-xs leading-5 text-muted-foreground">{t("Watch is available while your friend is in a multiplayer match. Ranked TOP 50 players can also be watched from the leaderboard.")}</p>
        </section>
        {friend ? <FriendMessages key={`${user!.id}:${friend.id}`} friend={friend} userId={user!.id} /> : <div className="grid min-h-72 place-items-center rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground"><div><MessageCircle aria-hidden="true" className="mx-auto mb-3 size-8" />{t("Select a friend to open your conversation.")}</div></div>}
      </div>
    </>}
  </div>;
}
