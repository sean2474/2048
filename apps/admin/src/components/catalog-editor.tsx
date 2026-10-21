"use client";

import { cloneElement, useEffect, useId, useRef, useState, type ReactElement } from "react";
import { useI18n } from "ui/i18n";
import { Button } from "ui/button";
import {
  AchievementInputSchema,
  CatalogImagePathSchema,
  CatalogSchema,
  CosmeticInputSchema,
  type AchievementInput,
  type ContentCatalog,
  type CosmeticInput,
} from "schema/catalog";
import { createClient } from "@/lib/supabase/client";

type Kind = "skin" | "icon" | "achievement";
type Editor = CosmeticInput | AchievementInput;
const empty: ContentCatalog = { skins: [], profileIcons: [], achievements: [] };
const metrics = {
  attendance_streak: "Consecutive attendance days",
  wins: "Eligible match wins",
  highest_tile: "Highest match tile",
  rank_tier: "Highest established tier",
  solo_time: "Best solo finish time (milliseconds)",
  solo_tile: "Highest endless tile",
  achievements: "Other achievements unlocked",
};
const patterns = [
  "dots",
  "gingham",
  "pinstripe",
  "weave",
  "runes",
  "sunrise",
  "magic-circle",
  "shield",
  "crossguard",
  "laurel",
  "compass",
] as const;
const characters = [
  "cat",
  "bunny",
  "sentinel",
  "runeknight",
  "arcanist",
  "diamond",
  "crown",
  "fox",
  "dragon",
  "phoenix",
] as const;

function newItem(kind: Kind): Editor {
  const common = { id: "", name: "", description: "", status: "draft" as const, sortOrder: 0 };
  if (kind === "achievement")
    return { ...common, metric: "wins", target: 10, reward: { kind: "icon", iconId: "" } };
  const cosmetic = { ...common, acquisition: "achievement" as const, price: 0 };
  return kind === "skin"
    ? {
        ...cosmetic,
        kind,
        rarity: "rare",
        tokens: { boardBackground: "#cbc5b6", emptyBackground: "#e1dccf", tileRadius: "0.5rem" },
      }
    : { ...cosmetic, kind, color: "#689ec3", imagePath: "" };
}

function imageUrl(path?: string) {
  return path && CatalogImagePathSchema.safeParse(path).success
    ? createClient().storage.from("catalog-assets").getPublicUrl(path).data.publicUrl
    : undefined;
}

function Field({ label, children }: { label: string; children: ReactElement<{ id?: string }> }) {
  const id = useId();
  return (
    <div className="min-w-0 space-y-2 text-sm font-semibold">
      <label className="block" htmlFor={id}>
        {label}
      </label>
      {cloneElement(children, { id })}
    </div>
  );
}

function ImageUpload({
  label,
  path,
  disabled,
  onChange,
  onBusy,
}: {
  label: string;
  path?: string;
  disabled: boolean;
  onChange: (path: string | undefined) => void;
  onBusy: (busy: boolean) => void;
}) {
  const { t } = useI18n();
  const [error, setError] = useState("");
  const current = useRef(0);
  useEffect(
    () => () => {
      current.current++;
    },
    [],
  );
  return (
    <div className="space-y-2">
      <Field label={label}>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={disabled}
          className="admin-field w-full py-2 text-xs"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            if (
              file.size > 2 * 1024 * 1024 ||
              !["image/png", "image/jpeg", "image/webp"].includes(file.type)
            ) {
              setError("Use a PNG, JPEG or WebP image up to 2 MB.");
              return;
            }
            const request = ++current.current;
            onBusy(true);
            setError("");
            try {
              const bitmap = await createImageBitmap(file);
              const valid = bitmap.width <= 4096 && bitmap.height <= 4096;
              bitmap.close();
              if (!valid) throw new Error("image_dimensions");
              const form = new FormData();
              form.set("file", file);
              const response = await fetch("/api/catalog-assets", { method: "POST", body: form });
              const result = await response.json();
              if (!response.ok || !CatalogImagePathSchema.safeParse(result.path).success)
                throw new Error("upload_failed");
              if (request === current.current) onChange(result.path);
            } catch {
              if (request === current.current)
                setError("Image upload failed. Use an image up to 4096 × 4096 and try again.");
            } finally {
              if (request === current.current) onBusy(false);
            }
          }}
        />
      </Field>
      {path && (
        <div className="flex items-center gap-3">
          {/* Storage paths are validated and displayed as images, never inline markup. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt=""
            src={imageUrl(path)}
            width={56}
            height={56}
            className="size-14 rounded-lg border object-contain"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => onChange(undefined)}
          >
            {t("Remove image")}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {t(error)}
        </p>
      )}
    </div>
  );
}

export function CatalogEditor({ initialCatalog }: { initialCatalog: ContentCatalog | null }) {
  const { t, locale } = useI18n();
  const [catalog, setCatalog] = useState(initialCatalog ?? empty),
    [loading, setLoading] = useState(false),
    [loadError, setLoadError] = useState(initialCatalog === null);
  const [kind, setKind] = useState<Kind>("skin"),
    [editor, setEditor] = useState<Editor>(() => newItem("skin"));
  const [revision, setRevision] = useState(0),
    [published, setPublished] = useState(false);
  const [saving, setSaving] = useState(false),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  const busy = useRef(false);
  useEffect(() => {
    if (refresh === 0) return;
    let active = true;
    setLoading(true);
    setLoadError(false);
    void (async () => {
      try {
        const result = await createClient().rpc("admin_content_catalog");
        if (result.error) throw result.error;
        const data = CatalogSchema.parse(result.data);
        if (active) setCatalog(data);
      } catch {
        if (active) setLoadError(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [refresh]);
  const items =
    kind === "skin" ? catalog.skins : kind === "icon" ? catalog.profileIcons : catalog.achievements;
  const disabled = saving || uploading || loading || loadError;
  const patch = (value: Partial<Editor>) =>
    setEditor((previous) => ({ ...previous, ...value }) as Editor);
  const label = (item: { name: string; nameKo?: string }) =>
    locale === "ko" && item.nameKo ? item.nameKo : t(item.name);
  function select(
    itemKind: Kind,
    item?:
      | ContentCatalog["skins"][number]
      | ContentCatalog["profileIcons"][number]
      | ContentCatalog["achievements"][number],
  ) {
    if (saving || uploading) return;
    setKind(itemKind);
    setError("");
    setNotice("");
    if (!item) {
      setEditor(newItem(itemKind));
      setRevision(0);
      setPublished(false);
      return;
    }
    const input = Object.fromEntries(
      Object.entries(item).filter(
        ([key]) => !["revision", "publishedOnce", "updatedAt"].includes(key),
      ),
    );
    setEditor(
      itemKind === "achievement"
        ? (input as AchievementInput)
        : ({ ...input, kind: itemKind } as CosmeticInput),
    );
    setRevision(item.revision);
    setPublished(item.publishedOnce);
  }
  async function save() {
    if (disabled || busy.current) return;
    const input = {
      ...editor,
      nameKo: editor.nameKo?.trim() || undefined,
      descriptionKo: editor.descriptionKo?.trim() || undefined,
    };
    const parsed =
      kind === "achievement"
        ? AchievementInputSchema.safeParse(input)
        : CosmeticInputSchema.safeParse(input);
    if (!parsed.success) {
      setError("Check the required fields, image, price and reward selection.");
      return;
    }
    busy.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result =
        kind === "achievement"
          ? await createClient().rpc("admin_save_achievement", {
              p_item: parsed.data,
              p_expected_revision: revision,
            })
          : await createClient().rpc("admin_save_cosmetic", {
              p_kind: kind,
              p_item: parsed.data,
              p_expected_revision: revision,
            });
      if (result.error) throw result.error;
      const schema =
        kind === "skin"
          ? CatalogSchema.shape.skins.element
          : kind === "icon"
            ? CatalogSchema.shape.profileIcons.element
            : CatalogSchema.shape.achievements.element;
      const saved = schema.parse(result.data);
      setRevision(saved.revision);
      setPublished(saved.publishedOnce);
      setNotice("Content saved.");
      setRefresh((value) => value + 1);
    } catch (cause) {
      const code = cause && typeof cause === "object" && "code" in cause ? cause.code : "";
      setError(
        code === "40001"
          ? "Someone changed this item. Reload the catalog and select it again before saving."
          : "Content could not be saved. Check reward items and images, then try again.",
      );
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  const skin = "kind" in editor && editor.kind === "skin" ? editor : undefined;
  const icon = "kind" in editor && editor.kind === "icon" ? editor : undefined;
  const achievement = "metric" in editor ? editor : undefined;
  const cosmetic = skin ?? icon;
  const setTokens = (tokens: Partial<NonNullable<typeof skin>["tokens"]>) => {
    if (skin) patch({ tokens: { ...skin.tokens, ...tokens } });
  };
  const rewardSkins = catalog.skins.filter((item) => item.acquisition === "achievement");
  const rewardIcons = catalog.profileIcons.filter((item) => item.acquisition === "achievement");
  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button
          variant="outline"
          disabled={saving || uploading || loading}
          onClick={() => setRefresh((value) => value + 1)}
        >
          {t("Refresh")}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("Content category")}>
        {(
          [
            ["skin", "Boards"],
            ["icon", "Profile icons"],
            ["achievement", "Achievements"],
          ] as const
        ).map(([value, title]) => (
          <Button
            key={value}
            variant={kind === value ? "default" : "outline"}
            aria-pressed={kind === value}
            disabled={saving || uploading}
            onClick={() => select(value)}
          >
            {t(title)}
          </Button>
        ))}
      </div>
      {loadError && (
        <p role="alert" className="admin-error">
          {t("Catalog could not be loaded. Refresh to try again.")}
        </p>
      )}
      {loading && (
        <p role="status" className="admin-state">
          {t("Loading content…")}
        </p>
      )}
      <div className="grid items-start gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="admin-panel overflow-hidden">
          <div className="border-b p-3">
            <Button
              className="w-full"
              variant="outline"
              disabled={disabled}
              onClick={() => select(kind)}
            >
              {t("Create new")}
            </Button>
          </div>
          <ul className="max-h-[36rem] divide-y overflow-y-auto">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`w-full p-4 text-left text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-[-2px] ${editor.id === item.id ? "bg-accent" : ""}`}
                  disabled={saving || uploading}
                  aria-current={editor.id === item.id ? "true" : undefined}
                  onClick={() => select(kind, item)}
                >
                  <span className="block break-words font-semibold">{label(item)}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {t(item.status)} · {item.id}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
        <form
          className="admin-panel min-w-0 space-y-5 p-5 sm:p-6"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <h2 className="admin-section-title">{t(revision ? "Edit content" : "New content")}</h2>
          <fieldset disabled={disabled} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("Content ID")}>
                <input
                  className="admin-field w-full"
                  value={editor.id}
                  disabled={revision > 0}
                  onChange={(event) => patch({ id: event.target.value })}
                  required
                  pattern="[a-z0-9][a-z0-9-]{0,63}"
                  maxLength={64}
                  placeholder="diamond-prism"
                />
              </Field>
              <Field label={t("Publication status")}>
                <select
                  className="admin-field w-full"
                  value={editor.status}
                  onChange={(event) => patch({ status: event.target.value as Editor["status"] })}
                >
                  <option value="draft" disabled={published}>
                    {t("draft")}
                  </option>
                  <option value="published">{t("published")}</option>
                  <option value="archived">{t("archived")}</option>
                </select>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("English name")}>
                <input
                  className="admin-field w-full"
                  value={editor.name}
                  onChange={(event) => patch({ name: event.target.value })}
                  required
                  maxLength={120}
                />
              </Field>
              <Field label={t("Korean name")}>
                <input
                  className="admin-field w-full"
                  value={editor.nameKo ?? ""}
                  onChange={(event) => patch({ nameKo: event.target.value })}
                  maxLength={120}
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("English description")}>
                <textarea
                  className="admin-field w-full py-2"
                  value={editor.description}
                  onChange={(event) => patch({ description: event.target.value })}
                  maxLength={1000}
                  rows={2}
                />
              </Field>
              <Field label={t("Korean description")}>
                <textarea
                  className="admin-field w-full py-2"
                  value={editor.descriptionKo ?? ""}
                  onChange={(event) => patch({ descriptionKo: event.target.value })}
                  maxLength={1000}
                  rows={2}
                />
              </Field>
            </div>
            <Field label={t("Display order")}>
              <input
                type="number"
                className="admin-field w-full sm:w-40"
                min={0}
                max={1000000}
                required
                value={editor.sortOrder}
                onChange={(event) => patch({ sortOrder: Number(event.target.value) })}
              />
            </Field>
            {cosmetic && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("How players obtain it")}>
                  <select
                    className="admin-field w-full"
                    disabled={published}
                    value={cosmetic.acquisition}
                    onChange={(event) =>
                      patch({
                        acquisition: event.target.value as CosmeticInput["acquisition"],
                        price: event.target.value === "coins" ? 300 : 0,
                      })
                    }
                  >
                    <option value="free">{t("Included")}</option>
                    <option value="coins">{t("Coin purchase")}</option>
                    <option value="achievement">{t("Achievement reward")}</option>
                  </select>
                </Field>
                <Field label={t("Coin price")}>
                  <input
                    type="number"
                    className="admin-field w-full"
                    min={cosmetic.acquisition === "coins" ? 1 : 0}
                    max={1000000000}
                    required
                    disabled={cosmetic.acquisition !== "coins"}
                    value={cosmetic.price}
                    onChange={(event) => patch({ price: Number(event.target.value) })}
                  />
                </Field>
              </div>
            )}
            {skin && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t("Rarity")}>
                    <select
                      className="admin-field w-full"
                      value={skin.rarity}
                      onChange={(event) =>
                        patch({ rarity: event.target.value as typeof skin.rarity })
                      }
                    >
                      {["common", "rare", "epic", "legendary"].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t("Tile corners")}>
                    <input
                      className="admin-field w-full"
                      value={skin.tokens.tileRadius}
                      onChange={(event) => setTokens({ tileRadius: event.target.value })}
                      required
                      placeholder="0.5rem"
                    />
                  </Field>
                  <Field label={t("Board color or gradient")}>
                    <input
                      className="admin-field w-full"
                      value={skin.tokens.boardBackground}
                      onChange={(event) => setTokens({ boardBackground: event.target.value })}
                      required
                      maxLength={1000}
                    />
                  </Field>
                  <Field label={t("Empty tile color")}>
                    <input
                      className="admin-field w-full"
                      value={skin.tokens.emptyBackground}
                      onChange={(event) => setTokens({ emptyBackground: event.target.value })}
                      required
                      maxLength={1000}
                    />
                  </Field>
                  <Field label={t("Tile pattern")}>
                    <select
                      className="admin-field w-full"
                      value={skin.tokens.tilePattern ?? ""}
                      onChange={(event) =>
                        setTokens({
                          tilePattern:
                            (event.target.value as typeof skin.tokens.tilePattern) || undefined,
                        })
                      }
                    >
                      <option value="">{t("None")}</option>
                      {patterns.map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t("Character and merge effect")}>
                    <select
                      className="admin-field w-full"
                      value={skin.tokens.character ?? ""}
                      onChange={(event) =>
                        setTokens({
                          character:
                            (event.target.value as typeof skin.tokens.character) || undefined,
                        })
                      }
                    >
                      <option value="">{t("None")}</option>
                      {characters.map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label={t("Tile palette (comma-separated hex colors)")}>
                  <input
                    className="admin-field w-full"
                    value={skin.tokens.tilePalette?.join(", ") ?? ""}
                    onChange={(event) =>
                      setTokens({
                        tilePalette: event.target.value
                          ? event.target.value.split(",").map((value) => value.trim())
                          : undefined,
                      })
                    }
                    placeholder="#fff1c9, #f8df9e"
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <ImageUpload
                    key={`${kind}-${editor.id}-board`}
                    label={t("Board image")}
                    path={skin.tokens.boardImagePath}
                    disabled={disabled}
                    onBusy={setUploading}
                    onChange={(boardImagePath) => setTokens({ boardImagePath })}
                  />
                  <ImageUpload
                    key={`${kind}-${editor.id}-tile`}
                    label={t("Tile decoration image")}
                    path={skin.tokens.tileImagePath}
                    disabled={disabled}
                    onBusy={setUploading}
                    onChange={(tileImagePath) => setTokens({ tileImagePath })}
                  />
                </div>
              </>
            )}
            {icon && (
              <>
                <Field label={t("Accent color")}>
                  <input
                    type="color"
                    className="admin-field h-12 w-24"
                    value={icon.color.slice(0, 7)}
                    onChange={(event) => patch({ color: event.target.value })}
                  />
                </Field>
                <ImageUpload
                  key={`${kind}-${editor.id}`}
                  label={t("Profile image")}
                  path={icon.imagePath}
                  disabled={disabled}
                  onBusy={setUploading}
                  onChange={(imagePath) => patch({ imagePath: imagePath ?? "" })}
                />
              </>
            )}
            {achievement && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t("Achievement condition")}>
                    <select
                      className="admin-field w-full"
                      value={achievement.metric}
                      onChange={(event) =>
                        patch({
                          metric: event.target.value as AchievementInput["metric"],
                          target: 1,
                        })
                      }
                    >
                      {Object.entries(metrics).map(([value, title]) => (
                        <option key={value} value={value}>
                          {t(title)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t("Target")}>
                    <input
                      className="admin-field w-full"
                      type="number"
                      required
                      min={1}
                      max={achievement.metric === "rank_tier" ? 6 : 1000000000}
                      value={achievement.target}
                      onChange={(event) => patch({ target: Number(event.target.value) })}
                    />
                  </Field>
                </div>
                {achievement.metric === "rank_tier" && (
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "1 Bronze · 2 Silver · 3 Gold · 4 Platinum · 5 Diamond · 6 Master. Placement must be complete.",
                    )}
                  </p>
                )}
                <fieldset disabled={published} className="space-y-4">
                  <Field label={t("Reward type")}>
                    <select
                      className="admin-field w-full"
                      value={achievement.reward.kind}
                      onChange={(event) =>
                        patch({
                          reward:
                            event.target.value === "set"
                              ? { kind: "set", skinId: "", iconId: "" }
                              : event.target.value === "skin"
                                ? { kind: "skin", skinId: "" }
                                : { kind: "icon", iconId: "" },
                        })
                      }
                    >
                      <option value="skin">{t("Board")}</option>
                      <option value="icon">{t("Profile icon")}</option>
                      <option value="set">{t("Board and profile set")}</option>
                    </select>
                  </Field>
                  {"skinId" in achievement.reward && (
                    <Field label={t("Reward board")}>
                      <select
                        className="admin-field w-full"
                        required
                        value={achievement.reward.skinId}
                        onChange={(event) =>
                          patch({
                            reward: {
                              ...achievement.reward,
                              skinId: event.target.value,
                            } as AchievementInput["reward"],
                          })
                        }
                      >
                        <option value="">{t("Select a reward")}</option>
                        {rewardSkins.map((item) => (
                          <option key={item.id} value={item.id}>
                            {label(item)} · {t(item.status)}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                  {"iconId" in achievement.reward && (
                    <Field label={t("Reward profile")}>
                      <select
                        className="admin-field w-full"
                        required
                        value={achievement.reward.iconId}
                        onChange={(event) =>
                          patch({
                            reward: {
                              ...achievement.reward,
                              iconId: event.target.value,
                            } as AchievementInput["reward"],
                          })
                        }
                      >
                        <option value="">{t("Select a reward")}</option>
                        {rewardIcons.map((item) => (
                          <option key={item.id} value={item.id}>
                            {label(item)} · {t(item.status)}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                </fieldset>
              </>
            )}
          </fieldset>
          {published && (
            <p className="text-xs leading-5 text-muted-foreground">
              {t(
                "Published IDs, acquisition methods and reward items are fixed to preserve ownership. Names, prices and targets remain editable.",
              )}
            </p>
          )}
          <section
            aria-label={t("Content preview")}
            className="flex flex-wrap items-center gap-5 rounded-xl border bg-secondary/30 p-4"
          >
            {skin && (
              <div
                className="grid size-36 shrink-0 grid-cols-3 gap-1 p-2"
                style={{
                  background: skin.tokens.boardBackground,
                  backgroundImage: imageUrl(skin.tokens.boardImagePath)
                    ? `url("${imageUrl(skin.tokens.boardImagePath)}")`
                    : undefined,
                  backgroundSize: "cover",
                  borderRadius: skin.tokens.tileRadius,
                }}
              >
                {[2, 4, 0, 8, 0, 16, 0, 32, 0].map((value, index) => (
                  <div
                    key={index}
                    className="grid place-items-center text-sm font-bold text-stone-800"
                    style={{
                      background: value
                        ? (skin.tokens.tilePalette?.[
                            Math.min(
                              Math.log2(value) - 1,
                              (skin.tokens.tilePalette?.length ?? 1) - 1,
                            )
                          ] ?? "#eee4da")
                        : skin.tokens.emptyBackground,
                      backgroundImage:
                        value && imageUrl(skin.tokens.tileImagePath)
                          ? `url("${imageUrl(skin.tokens.tileImagePath)}")`
                          : undefined,
                      backgroundSize: "cover",
                      borderRadius: skin.tokens.tileRadius,
                    }}
                  >
                    <span className="rounded bg-white/85 px-1">{value || ""}</span>
                  </div>
                ))}
              </div>
            )}
            {icon && imageUrl(icon.imagePath) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl(icon.imagePath)}
                alt={label(editor)}
                width={96}
                height={96}
                className="size-24 rounded-full object-contain"
              />
            )}
            <div className="min-w-0">
              <p className="text-xs font-semibold text-muted-foreground">{t("Content preview")}</p>
              <p className="mt-1 break-words text-lg font-bold">
                {label(editor) || t("New content")}
              </p>
              <p className="mt-1 break-words text-sm text-muted-foreground">
                {locale === "ko" && editor.descriptionKo
                  ? editor.descriptionKo
                  : editor.description}
              </p>
              {achievement && (
                <p className="mt-2 text-sm">
                  {t(metrics[achievement.metric])} · {achievement.target}
                </p>
              )}
            </div>
          </section>
          {error && (
            <p role="alert" className="admin-error">
              {t(error)}
            </p>
          )}
          {notice && (
            <p role="status" className="admin-success">
              {t(notice)}
            </p>
          )}
          <Button type="submit" disabled={disabled}>
            {t(uploading ? "Uploading image…" : saving ? "Saving…" : "Save content")}
          </Button>
        </form>
      </div>
    </div>
  );
}
