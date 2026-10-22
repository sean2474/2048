"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Keyboard } from "lucide-react";
import { Button } from "ui/button";
import { useI18n } from "ui/i18n";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  bindingCodeFromEvent,
  DEFAULT_KEYBINDINGS,
  KEY_ACTIONS,
  keyLabel,
  type KeyAction,
  type Keybindings,
} from "@/lib/keybindings";
import { useSettings } from "@/hooks/settings-provider";

const ACTION_LABELS: Record<KeyAction, string> = {
  up: "Move up",
  down: "Move down",
  left: "Move left",
  right: "Move right",
  ability: "Use special ability",
};

export function KeybindingSettings({
  bindings,
  saveBindings,
  storageError,
  onOpenChange,
}: {
  bindings: Keybindings;
  saveBindings: (next: Keybindings, customShortcuts?: boolean) => Promise<boolean>;
  storageError: string | null;
  onOpenChange?: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const { ready, saving, scope, settings } = useSettings();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Keybindings>(bindings);
  const [shortcuts, setShortcuts] = useState(settings.customShortcuts);
  const [listening, setListening] = useState<KeyAction | null>(null);
  const capturedKey = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready && open) {
      setOpen(false);
      setListening(null);
      onOpenChange?.(false);
    }
  }, [ready, open, onOpenChange]);

  const changeOpen = (next: boolean) => {
    if (saving) return;
    setOpen(next);
    setDraft({ ...bindings });
    setShortcuts(settings.customShortcuts);
    setListening(null);
    capturedKey.current = null;
    setError(null);
    onOpenChange?.(next);
  };

  const captureKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (capturedKey.current === event.code) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (!listening) return;
    if (event.key === "Tab") {
      setListening(null);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setListening(null);
      setError(null);
      return;
    }
    const code = bindingCodeFromEvent(event.nativeEvent);
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) return;
    if (!code) {
      setError(
        t("Choose A–Z, 0–9 or Space without Shift, Ctrl, Alt or Command. Arrow keys stay fixed."),
      );
      return;
    }
    capturedKey.current = code;
    const duplicate = KEY_ACTIONS.find((action) => action !== listening && draft[action] === code);
    if (duplicate) {
      setError(
        t("{key} is already used for {action}.", {
          key: t(keyLabel(code)),
          action: t(ACTION_LABELS[duplicate]),
        }),
      );
      return;
    }
    setDraft((current) => ({ ...current, [listening]: code }));
    setListening(null);
    setError(null);
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={!ready || saving}>
          <Keyboard className="size-4" aria-hidden="true" />
          {t("Keybindings")}
        </Button>
      </DialogTrigger>
      <DialogContent
        onKeyDownCapture={captureKey}
        onKeyUpCapture={(event) => {
          if (capturedKey.current !== event.code) return;
          event.preventDefault();
          event.stopPropagation();
          capturedKey.current = null;
        }}
        onEscapeKeyDown={(event) => {
          if (listening) {
            event.preventDefault();
            setListening(null);
            setError(null);
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t("Keybindings")}</DialogTitle>
          <DialogDescription className="leading-6">
            {t("Choose your extra movement and ability keys. Arrow keys always work.")}
          </DialogDescription>
        </DialogHeader>
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={shortcuts}
            disabled={saving}
            onChange={(event) => setShortcuts(event.target.checked)}
          />
          {t("Enable custom shortcuts")}
        </label>
        <p className="text-xs leading-5 text-muted-foreground">
          {t(
            "Use letters, numbers or Space. Letter and number keys use their physical positions, even with Korean input enabled.",
          )}
        </p>
        <div className="divide-y divide-border rounded-xl border px-4">
          {KEY_ACTIONS.map((action) => (
            <div key={action} className="flex min-h-16 items-center justify-between gap-3 py-2">
              <span id={`binding-${action}`} className="text-sm font-semibold">
                {t(ACTION_LABELS[action])}
              </span>
              <Button
                type="button"
                disabled={saving}
                variant={listening === action ? "default" : "outline"}
                className="min-w-24"
                aria-labelledby={`binding-${action} binding-key-${action}`}
                aria-pressed={listening === action}
                onClick={() => {
                  capturedKey.current = null;
                  setListening(action);
                  setError(null);
                }}
              >
                <span id={`binding-key-${action}`}>
                  {listening === action ? t("Press a key…") : t(keyLabel(draft[action]))}
                </span>
              </Button>
            </div>
          ))}
        </div>
        <p className="text-xs leading-5 text-muted-foreground" role="status">
          {listening
            ? t("Press a letter, number or Space. Esc cancels. Tab moves to the next control.")
            : t(
                scope === "account"
                  ? "Select a key to change it. Your settings are saved to your account."
                  : "Select a key to change it. Guest settings are saved in cookies.",
              )}
        </p>
        {(error || storageError) && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {error || t(storageError!)}
          </p>
        )}
        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            disabled={saving}
            onClick={() => {
              setDraft({ ...DEFAULT_KEYBINDINGS });
              setListening(null);
              setError(null);
            }}
          >
            {t("Reset keys")}
          </Button>
          <div className="flex gap-2 [&>button]:flex-1">
            <Button variant="outline" disabled={saving} onClick={() => changeOpen(false)}>
              {t("Cancel")}
            </Button>
            <Button
              disabled={!ready || saving || listening !== null}
              onClick={async () => {
                if (
                  await saveBindings(
                    draft,
                    shortcuts === settings.customShortcuts ? undefined : shortcuts,
                  )
                ) {
                  setOpen(false);
                  setListening(null);
                  onOpenChange?.(false);
                }
              }}
            >
              {t(saving ? "Saving…" : "Save keys")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
