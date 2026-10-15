import { z } from "zod";

export const FeedbackInputSchema = z.object({
  id: z.string().uuid(),
  category: z.enum(["bug", "feedback"]),
  subject: z.string().trim().min(1).max(120),
  message: z.string().trim().min(10).max(3000),
}).strict();

export type FeedbackInput = z.infer<typeof FeedbackInputSchema>;
export type Feedback = FeedbackInput & { reporter_id: string | null; created_at: string };
