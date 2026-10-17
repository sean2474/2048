"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DirectMessage, SocialPlayer } from "schema/social";
import { useI18n } from "ui/i18n";
import { Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useLiveQuery } from "@/hooks/use-live-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function FriendMessages({ friend, userId }: { friend: SocialPlayer; userId: string }) {
  const { t, locale } = useI18n();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<DirectMessage[]>([]);
  const [more, setMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const requestId = useRef<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const load = useCallback(async (client: SupabaseClient) => {
    const { data, error } = await client.rpc("social_messages", { p_target: friend.id });
    if (error) throw error;
    return data as DirectMessage[];
  }, [friend.id]);
  const query = useLiveQuery({ table: "direct_messages", load });
  const messages = [...new Map([...history, ...query.data].map(message => [message.id, message])).values()].sort((a,b) => a.id-b.id);
  useEffect(() => {
    if (query.data.length) setHistory(current => [...new Map([...current, ...query.data].map(message => [message.id, message])).values()]);
  }, [query.data]);
  const newest = query.data[0]?.id;
  useEffect(() => { if (newest) bottom.current?.scrollIntoView({ block: "nearest" }); }, [newest]);
  async function send() {
    if (sending || !draft.trim()) return;
    setSending(true); setError("");
    requestId.current ??= crypto.randomUUID();
    try {
      const { error } = await createClient().rpc("send_direct_message", { p_target: friend.id, p_body: draft.trim(), p_request: requestId.current });
      if (error) throw error;
      if (!active.current) return;
      setDraft(""); requestId.current = null; query.reload();
    } catch (cause) {
      if (active.current) setError((cause as { code?: string }).code === "54000" ? "Too many messages. Try again in a minute." : "Message not sent. Check your connection and friendship, then retry.");
    } finally { if (active.current) setSending(false); }
  }
  async function loadOlder() {
    setLoadingMore(true); setError("");
    try {
      const { data, error } = await createClient().rpc("social_messages", { p_target: friend.id, p_before: messages[0]?.id });
      if (error) throw error;
      if (!active.current) return;
      setHistory(current => [...(data as DirectMessage[]), ...current]); setMore(data.length === 50);
    } catch { if (active.current) setError("Could not load earlier messages. Try again."); }
    finally { if (active.current) setLoadingMore(false); }
  }
  return <section aria-labelledby="conversation-title" className="flex min-w-0 flex-col rounded-2xl border bg-card">
    <div className="border-b p-4"><h2 id="conversation-title" className="font-bold">{t("Messages with {name}", { name: friend.name })}</h2><p className="mt-1 text-xs text-muted-foreground">{t("Only you and your friend can read this conversation.")}</p></div>
    <div aria-label={t("Conversation")} className="h-[380px] space-y-3 overflow-y-auto overscroll-contain p-4" tabIndex={0}>
      {more && query.data.length === 50 && <Button variant="ghost" disabled={loadingMore} onClick={() => void loadOlder()} className="mx-auto flex">{t(loadingMore ? "Loading…" : "Earlier messages")}</Button>}
      {query.loading && <p role="status" className="text-sm text-muted-foreground">{t("Loading messages…")}</p>}
      {query.error && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{query.error}</p><Button variant="outline" onClick={query.reload}>{t("Try again")}</Button></div>}
      {!query.loading && !query.error && !messages.length && <p className="py-10 text-center text-sm text-muted-foreground">{t("Say hello to your friend.")}</p>}
      <ol className="space-y-3">{messages.map(message => <li key={message.id} className={`w-fit max-w-[85%] rounded-2xl px-4 py-2 ${message.sender_id === userId ? "ml-auto bg-primary text-primary-foreground" : "bg-muted"}`}>
        <span className="sr-only">{message.sender_id === userId ? t("You") : friend.name}: </span><p className="whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{message.body}</p>
        <time dateTime={message.created_at} className="mt-1 block text-right text-[10px] opacity-75">{new Date(message.created_at).toLocaleString(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time>
      </li>)}</ol><div ref={bottom} />
    </div>
    <div aria-live="polite" className="sr-only">{newest ? t("Conversation updated") : ""}</div>
    <form onSubmit={event => { event.preventDefault(); void send(); }} className="space-y-2 border-t p-3">
      {error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}
      <div className="flex items-end gap-2"><Input label="Message" name="message" type="text" className="min-w-0 flex-1" value={draft} maxLength={1000} readOnly={sending} onChange={event => { setDraft(event.target.value); requestId.current = null; }} /><Button type="submit" className="h-12" disabled={sending || !draft.trim()} aria-label={t("Send message")}><Send aria-hidden="true" className="size-4" /><span className="hidden sm:inline">{t(sending ? "Sending…" : "Send")}</span></Button></div>
      <p className="text-right text-[10px] text-muted-foreground">{draft.length}/1,000</p>
    </form>
  </section>;
}
