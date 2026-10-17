"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useI18n } from "ui/i18n";
import type { ChallengeEvent, ChallengeReply, FriendChallenge, FriendChallengeCommand, FriendPresence } from "schema/social";
import { createGameSocket, CURRENT_ROOM_KEY } from "@/lib/multiplayer";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePlayer } from "./use-player";

const Context = createContext<FriendPresence | null>(null);
const ChallengeContext = createContext<{ send: (command: FriendChallengeCommand) => void; pending: boolean; busy: boolean } | null>(null);
const errors: Record<NonNullable<ChallengeReply["error"]>, string> = {
  invalid: "This match request is invalid.", unavailable: "Could not send the match request. Please try again.",
  not_friends: "You can only challenge accepted friends.", busy: "A player is already playing, matchmaking, or handling another request.",
  offline: "Your friend is no longer online.", rate_limited: "Wait a few seconds before sending another match request.", expired: "This match request has expired.",
};

export function FriendPresenceProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const router = useRouter();
  const { user } = usePlayer();
  const accountId = user && !user.is_anonymous ? user.id : null;
  const [presence, setPresence] = useState<FriendPresence | null>(null);
  const socketRef = useRef<ReturnType<typeof createGameSocket> | null>(null);
  const currentInvitation = useRef<FriendChallenge | null>(null);
  const sending = useRef(false);
  const request = useRef(0);
  const [invitation, setInvitation] = useState<FriendChallenge | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const send = useCallback((command: FriendChallengeCommand) => {
    const socket = socketRef.current;
    if (sending.current) return;
    if (!socket?.connected) { setError(errors.unavailable); return; }
    sending.current = true; setBusy(true); setError(""); setNotice("");
    const version = ++request.current;
    socket.timeout(10_000).emit("challenge", command, (failure: Error | null, reply: ChallengeReply) => {
      if (socketRef.current !== socket || request.current !== version) return;
      sending.current = false; setBusy(false);
      if (failure || reply?.error) setError(failure ? errors.unavailable : errors[reply.error!]);
    });
  }, []);
  useEffect(() => {
    setPresence(null);
    currentInvitation.current = null; setInvitation(null); sending.current = false; setBusy(false); setError(""); setNotice("");
    if (!accountId) return;
    let socket: ReturnType<typeof createGameSocket>;
    try { socket = createGameSocket(true); }
    catch { setPresence({ error: "presence_unavailable" }); return; }
    let active = true;
    socketRef.current = socket;
    let timeout: ReturnType<typeof setTimeout>;
    const unavailable = () => {
      clearTimeout(timeout); setPresence({ error: "presence_unavailable" }); request.current++; sending.current = false; setBusy(false);
      if (currentInvitation.current) { setNotice("The match request ended because a player became unavailable."); currentInvitation.current = null; setInvitation(null); }
    };
    socket.on("connect", () => {
      clearTimeout(timeout);
      timeout = setTimeout(unavailable, 10_000);
      socket.emit("friends");
    });
    socket.on("friendPresence", (value: FriendPresence) => { clearTimeout(timeout); setPresence(value); });
    socket.on("challenge", (event: ChallengeEvent) => {
      if (event.t === "pending") { currentInvitation.current = event.invitation; setInvitation(event.invitation); setError(""); setNotice(""); }
      else if (event.t === "closed" && currentInvitation.current?.id === event.id) {
        currentInvitation.current = null; setInvitation(null);
        const messages = { declined: "The match request was declined.", cancelled: "The match request was cancelled.", expired: "This match request has expired.", unavailable: "The match request ended because a player became unavailable.", accepted: "" };
        setNotice(messages[event.reason]);
      } else if (event.t === "start") {
        currentInvitation.current = null; setInvitation(null); setError(""); setNotice("");
        try { sessionStorage.setItem(CURRENT_ROOM_KEY, event.roomId); }
        catch { /* The game URL still joins this tab to its reserved player slot. */ }
        router.push(`/play/${event.roomId}`);
      }
    });
    socket.on("disconnect", unavailable);
    socket.on("connect_error", unavailable);
    // A passive connection keeps online status without taking over the game session.
    socket.connect();
    const { data: { subscription } } = createClient().auth.onAuthStateChange(event => {
      if (event === "TOKEN_REFRESHED") queueMicrotask(() => { if (active) { socket.disconnect(); socket.connect(); } });
    });
    const reconnect = () => { if (document.visibilityState === "visible" && !socket.connected) socket.connect(); };
    window.addEventListener("online", reconnect);
    document.addEventListener("visibilitychange", reconnect);
    return () => {
      active = false; clearTimeout(timeout); subscription.unsubscribe();
      socketRef.current = null;
      request.current++;
      window.removeEventListener("online", reconnect); document.removeEventListener("visibilitychange", reconnect);
      socket.removeAllListeners(); socket.disconnect();
    };
  }, [accountId, router]);
  const incoming = invitation?.to.id === accountId;
  const dismiss = () => { if (invitation && !busy) send({ t: incoming ? "decline" : "cancel", id: invitation.id }); };
  return <Context.Provider value={presence}><ChallengeContext.Provider value={{ send, pending: !!invitation, busy }}>
    {children}
    <Dialog open={!!invitation} onOpenChange={open => { if (!open) dismiss(); }}>
      <DialogContent showCloseButton={false}>
        <DialogHeader><DialogTitle>{t(incoming ? "Friend match request" : "Match request sent")}</DialogTitle><DialogDescription>
          {invitation && t(incoming ? "{name} wants to play a match with you." : "Waiting for {name} to accept…", { name: incoming ? invitation.from.name : invitation.to.name })}
        </DialogDescription></DialogHeader>
        <p className="text-sm leading-6 text-muted-foreground">{t("Accepting starts a friend match immediately. This request expires after 30 seconds.")}</p>
        {error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}
        <DialogFooter><Button variant="outline" disabled={busy} onClick={dismiss}>{t(incoming ? "Decline match" : "Cancel match request")}</Button>
          {incoming && <Button disabled={busy} onClick={() => invitation && send({ t: "accept", id: invitation.id })}>{t("Accept and play")}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
    {!invitation && (error || notice) && <div className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl border bg-card p-4 shadow-lg">
      <p role={error ? "alert" : "status"} className={`min-w-0 flex-1 text-sm ${error ? "text-destructive" : ""}`}>{t(error || notice)}</p>
      <Button variant="ghost" size="icon" aria-label={t("Close")} onClick={() => { setError(""); setNotice(""); }}><X aria-hidden="true" className="size-4" /></Button>
    </div>}
  </ChallengeContext.Provider></Context.Provider>;
}

export const useFriendPresence = () => useContext(Context);
export const useFriendChallenges = () => useContext(ChallengeContext);
