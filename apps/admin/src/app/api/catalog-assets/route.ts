import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { catalogImageType, MAX_CATALOG_IMAGE_BYTES } from "@/lib/catalog-image";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const reply = (status: number, error: string) =>
    NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
  const url = new URL(request.url);
  const host = request.headers.get("host") ?? url.host;
  const protocol = request.headers.get("x-forwarded-proto") ?? url.protocol.slice(0, -1);
  if (request.headers.get("origin") !== `${protocol}://${host}`)
    return reply(403, "invalid_origin");
  if (!isSupabaseConfigured()) return reply(503, "not_configured");
  try {
    const client = await createClient();
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    if (error || !user || user.is_anonymous) return reply(401, "authentication_required");
    const role = await client.rpc("is_game_admin");
    if (role.error) return reply(503, "admin_verification_unavailable");
    if (role.data !== true) return reply(403, "admin_access_required");
    const reader = request.body?.getReader();
    if (!reader) return reply(400, "image_required");
    const chunks: Uint8Array[] = [];
    let length = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MAX_CATALOG_IMAGE_BYTES + 65536) {
        await reader.cancel();
        return reply(413, "image_too_large");
      }
      chunks.push(value);
    }
    const body = Buffer.concat(chunks);
    let form: FormData;
    try {
      form = await new Response(body, {
        headers: { "Content-Type": request.headers.get("content-type") ?? "" },
      }).formData();
    } catch {
      return reply(400, "invalid_form");
    }
    const file = form.get("file");
    if (!(file instanceof File)) return reply(400, "image_required");
    if (file.size > MAX_CATALOG_IMAGE_BYTES) return reply(413, "image_too_large");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = catalogImageType(bytes, file.type);
    if (!type) return reply(400, "invalid_image");
    // New paths preserve cached images and previously published content.
    const path = `uploads/${randomUUID()}.${type.extension}`;
    const uploaded = await client.storage.from("catalog-assets").upload(path, bytes, {
      contentType: type.contentType,
      cacheControl: "31536000",
      upsert: false,
    });
    if (uploaded.error) return reply(503, "upload_failed");
    return NextResponse.json({ path }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch {
    return reply(503, "upload_failed");
  }
}
