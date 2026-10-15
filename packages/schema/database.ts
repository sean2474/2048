import { z } from "zod";

// ============================================
// Players
// ============================================
export const PlayerSchema = z.object({
  id: z.string().uuid(),
  username: z.string().min(2).max(16).nullable(),
  name: z.string(),
  image_path: z.string().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type Player = z.infer<typeof PlayerSchema>;
