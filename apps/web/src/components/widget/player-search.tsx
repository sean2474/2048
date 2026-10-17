"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Search } from "lucide-react";
import type { SocialPlayer } from "schema/social";
import { useI18n } from "ui/i18n";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProfileIcon } from "./profile-icon";

export function PlayerSearch({ onSearch, onSelect }: { onSearch: (query: string) => void; onSelect: (id: string) => void }) {
  const { t } = useI18n();
  const listId = useId();
  const list = useRef<HTMLUListElement>(null);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [composing, setComposing] = useState(false);
  const [players, setPlayers] = useState<SocialPlayer[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [active, setActive] = useState(-1);
  const query = search.trim();
  const visible = open && !!query && !composing;

  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    setStatus("loading"); setPlayers([]); setActive(-1);
    const timer = setTimeout(async () => {
      try {
        const { data, error } = await createClient().rpc("social_players", { p_query: search.trim() }).abortSignal(controller.signal);
        if (error) throw error;
        if (!controller.signal.aborted) { setPlayers((data as SocialPlayer[]).slice(0, 8)); setStatus("ready"); }
      } catch { if (!controller.signal.aborted) setStatus("error"); }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [search, visible]);

  useEffect(() => { list.current?.children.item(active)?.scrollIntoView({ block: "nearest" }); }, [active]);

  function select(person: SocialPlayer) {
    setSearch(person.name); setOpen(false); setActive(-1); onSelect(person.id);
  }

  return <form className="relative max-w-xl" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setActive(-1); }
  }} onSubmit={event => {
    event.preventDefault();
    if (!query || composing) return;
    setOpen(false); setActive(-1); onSearch(query);
  }}>
    <div className="flex items-end gap-2">
      <Input label="Search player name (1–32 characters)" name="player-search" type="search" className="min-w-0 flex-1" maxLength={32} autoComplete="off"
        role="combobox" aria-autocomplete="list" aria-expanded={visible} aria-controls={visible ? listId : undefined}
        aria-activedescendant={visible && players[active] ? `${listId}-${active}` : undefined}
        value={search} onChange={event => { setSearch(event.target.value); setOpen(true); setPlayers([]); setStatus("loading"); setActive(-1); }}
        onFocus={() => setOpen(true)} onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing || event.keyCode === 229) return;
          if (event.key === "Escape") { event.preventDefault(); setOpen(false); setActive(-1); }
          else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault(); setOpen(true);
            if (visible && players.length) setActive(index => event.key === "ArrowDown" ? (index + 1) % players.length : (index <= 0 ? players.length - 1 : index - 1));
          } else if (event.key === "Enter" && visible && players[active]) { event.preventDefault(); select(players[active]); }
          else if (event.key === "Tab") setOpen(false);
        }} />
      <Button type="submit" className="h-12" disabled={!query || composing}><Search aria-hidden="true" className="size-4" />{t("Search")}</Button>
    </div>
    {visible && <div className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-xl border bg-card shadow-lg">
      <ul ref={list} id={listId} role="listbox" aria-label={t("Suggested players")} aria-busy={status === "loading"} className="max-h-72 overflow-y-auto overscroll-contain p-1">
        {players.map((person, index) => <li key={person.id} role="presentation"><button type="button" id={`${listId}-${index}`} role="option" aria-selected={active === index} tabIndex={-1}
          className={`flex min-h-14 w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-muted ${active === index ? "bg-muted" : ""}`}
          onMouseDown={event => event.preventDefault()} onClick={() => select(person)}>
          <ProfileIcon iconId={person.icon_id} className="size-9 shrink-0" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{person.name}</span>
            {person.relationship && <span className="block text-xs text-muted-foreground">{t(person.relationship === "friend" ? "Friend" : person.relationship === "incoming" ? "Wants to be your friend" : "Request pending")}</span>}
          </span>
        </button></li>)}
      </ul>
      <p role="status" className={status !== "ready" || !players.length ? "px-4 pb-3 pt-2 text-sm text-muted-foreground" : "sr-only"}>
        {t(status === "loading" ? "Searching…" : status === "error" ? "Could not load suggestions. Try searching again." : !players.length ? "No players found." : "{count} suggested players. Use the arrow keys to choose.", { count: players.length })}
      </p>
    </div>}
  </form>;
}
