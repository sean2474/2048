"use client";
import { Check, Globe, Keyboard } from "lucide-react";
import { useI18n } from "ui/i18n";
import { Button } from "@/components/ui/button";
import { KeybindingSettings } from "@/components/widget/keybinding-settings";
import { useKeybindings } from "@/hooks/use-keybindings";
import { useSettings } from "@/hooks/settings-provider";
export function PreferencesSettings() {
  const { t } = useI18n();
  const { settings, ready, saving, error, scope, saveSettings, retry } = useSettings();
  const { bindings, saveBindings, storageError } = useKeybindings();
  return (
    <>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {t(
          scope === "account"
            ? "These preferences are saved to your account."
            : "Guest preferences are saved in this browser.",
        )}
      </p>
      {!ready && (
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          {t("Loading settings…")}
        </p>
      )}
      <div className="mt-5 divide-y">
        <div className="space-y-4 pb-5">
          <div className="flex items-center gap-3">
            <Globe aria-hidden="true" className="size-5 shrink-0 text-primary" />
            <div>
              <h3 id="language-label" className="text-sm font-semibold">
                {t("Language")}
              </h3>
              <p id="language-help" className="mt-1 text-xs leading-5 text-muted-foreground">
                {t("Your first language is based on your location. You can change it anytime.")}
              </p>
            </div>
          </div>
          <fieldset
            disabled={!ready || saving}
            aria-labelledby="language-label"
            aria-describedby="language-help"
            className="grid min-w-0 grid-cols-2 gap-2"
          >
            {(
              [
                { value: "ko", label: "한국어" },
                { value: "en", label: "English" },
              ] as const
            ).map((option) => (
              <label key={option.value} className="relative min-w-0">
                <input
                  type="radio"
                  name="language"
                  value={option.value}
                  checked={settings.locale === option.value}
                  onChange={() => void saveSettings({ locale: option.value })}
                  className="peer sr-only"
                />
                <span
                  lang={option.value}
                  className="flex min-h-14 cursor-pointer items-center justify-between gap-2 rounded-xl border bg-background/40 px-4 text-sm font-semibold transition-colors hover:border-primary/50 peer-checked:border-primary peer-checked:bg-primary/10 peer-checked:text-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary peer-disabled:cursor-wait peer-disabled:opacity-50"
                >
                  {option.label}
                  <Check
                    aria-hidden="true"
                    className={`size-4 shrink-0 ${settings.locale === option.value ? "" : "invisible"}`}
                  />
                </span>
              </label>
            ))}
          </fieldset>
        </div>
        <div className="space-y-4 py-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 id="shortcuts-label" className="text-sm font-semibold">
                {t("Custom keyboard shortcuts")}
              </h3>
              <p id="shortcuts-help" className="mt-1 text-xs leading-5 text-muted-foreground">
                {t(
                  "Use your chosen letter and number keys. Arrow keys and touch controls always work.",
                )}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.customShortcuts}
              aria-labelledby="shortcuts-label"
              aria-describedby="shortcuts-help"
              disabled={!ready || saving}
              onClick={() => void saveSettings({ customShortcuts: !settings.customShortcuts })}
              className={`inline-flex min-h-11 min-w-16 shrink-0 items-center justify-center rounded-xl border px-3 text-xs font-bold transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${settings.customShortcuts ? "border-secondary/40 bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              {t(settings.customShortcuts ? "On" : "Off")}
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/50 p-3">
            <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Keyboard aria-hidden="true" className="size-4" />
              {t("Movement and attack keys")}
            </span>
            <KeybindingSettings
              bindings={bindings}
              saveBindings={saveBindings}
              storageError={storageError}
            />
          </div>
        </div>
      </div>
      {saving && (
        <p role="status" className="text-xs text-muted-foreground">
          {t("Saving settings…")}
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/25 p-3"
        >
          <p className="text-sm leading-6 text-destructive">{t(error)}</p>
          <Button variant="outline" disabled={saving} onClick={() => void retry()}>
            {t("Try again")}
          </Button>
        </div>
      )}
    </>
  );
}
