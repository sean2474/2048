import { CatalogImagePathSchema } from "schema/catalog";

export function catalogAssetUrl(path?: string) {
  if (!path || !CatalogImagePathSchema.safeParse(path).success) return undefined;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/catalog-assets/${path}`;
}

export function boardBackground(tokens: { boardBackground: string; boardImagePath?: string }) {
  const image = catalogAssetUrl(tokens.boardImagePath);
  return image
    ? `url("${image}") center / cover, ${tokens.boardBackground}`
    : tokens.boardBackground;
}
