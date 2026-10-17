import { z } from "zod";

export const CatalogIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);
export const CatalogImagePathSchema = z.string().max(220).regex(/^[a-z0-9][a-z0-9/_-]*\.(?:png|jpe?g|webp|svg)$/).refine(path => !path.includes("//"));
export const CatalogStatusSchema = z.enum(["draft", "published", "archived"]);
export const CatalogAcquisitionSchema = z.enum(["free", "coins", "achievement"]);
const text = z.string().trim().min(1).max(120);
const description = z.string().trim().max(1000);
const css = z.string().min(1).max(1000).regex(/^[a-zA-Z0-9#(),.%\s\/-]+$/).refine(value => !/url\s*\(|expression\s*\(|var\s*\(/i.test(value));
const color = z.string().regex(/^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/);
export const CatalogSkinTokensSchema = z.object({
  boardBackground: css, emptyBackground: css,
  tileRadius: z.string().regex(/^\d+(?:\.\d+)?(?:rem|px|%)$/),
  tilePattern: z.enum(["dots", "gingham", "pinstripe", "weave", "runes", "sunrise", "magic-circle", "shield", "crossguard", "laurel", "compass"]).optional(),
  tilePalette: z.array(color).min(1).max(16).optional(),
  character: z.enum(["cat", "bunny", "sentinel", "runeknight", "arcanist", "diamond", "crown", "fox", "dragon", "phoenix"]).optional(),
  boardImagePath: CatalogImagePathSchema.optional(), tileImagePath: CatalogImagePathSchema.optional(),
}).strict();
const metadata = {
  id: CatalogIdSchema, name: text, nameKo: text.optional(), description: description.default(""), descriptionKo: description.optional(),
  status: CatalogStatusSchema, sortOrder: z.number().int().min(0).max(1000000).default(0),
};
const cosmetic = { ...metadata, acquisition: CatalogAcquisitionSchema, price: z.number().int().min(0).max(1000000000) };
export const CatalogSkinInputSchema = z.object({ ...cosmetic, kind: z.literal("skin"), rarity: z.enum(["common", "rare", "epic", "legendary"]), tokens: CatalogSkinTokensSchema }).strict();
export const CatalogIconInputSchema = z.object({ ...cosmetic, id: CatalogIdSchema.refine(id => id !== "guest", { message: "The guest avatar ID is reserved" }), kind: z.literal("icon"), color, imagePath: CatalogImagePathSchema }).strict();
export const CosmeticInputSchema = z.discriminatedUnion("kind", [CatalogSkinInputSchema, CatalogIconInputSchema]).refine(item => item.acquisition === "coins" ? item.price > 0 : item.price === 0, { message: "Only coin items have a price", path: ["price"] });
export const CatalogRewardSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("skin"), skinId: CatalogIdSchema }).strict(),
  z.object({ kind: z.literal("icon"), iconId: CatalogIdSchema }).strict(),
  z.object({ kind: z.literal("set"), skinId: CatalogIdSchema, iconId: CatalogIdSchema }).strict(),
]);
export const AchievementInputSchema = z.object({ ...metadata,
  metric: z.enum(["attendance_streak", "wins", "highest_tile", "rank_tier", "solo_time", "solo_tile", "achievements"]),
  target: z.number().int().min(1).max(1000000000), reward: CatalogRewardSchema,
}).strict().refine(item => item.metric !== "rank_tier" || item.target <= 6, { message: "Rank target must be 1–6", path: ["target"] });
const record = { revision: z.number().int().min(1), publishedOnce: z.boolean(), updatedAt: z.string().datetime({ offset: true }) };
export const CatalogSkinSchema = CatalogSkinInputSchema.omit({kind:true}).extend(record);
export const CatalogProfileIconSchema = CatalogIconInputSchema.omit({kind:true}).extend(record);
export const CatalogAchievementSchema = AchievementInputSchema.innerType().extend(record);
export const CatalogSchema = z.object({ skins: z.array(CatalogSkinSchema), profileIcons: z.array(CatalogProfileIconSchema), achievements: z.array(CatalogAchievementSchema) });
export type CosmeticInput = z.infer<typeof CosmeticInputSchema>;
export type AchievementInput = z.infer<typeof AchievementInputSchema>;
export type CatalogSkin = z.infer<typeof CatalogSkinSchema>;
export type CatalogProfileIcon = z.infer<typeof CatalogProfileIconSchema>;
export type CatalogAchievement = z.infer<typeof CatalogAchievementSchema>;
export type ContentCatalog = z.infer<typeof CatalogSchema>;
