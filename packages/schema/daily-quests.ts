import { z } from "zod";

export const DAILY_QUESTS = [
  {
    id: "check-in",
    name: "Show up today",
    description: "Visit while signed in to check in today.",
    target: 1,
    coins: 20,
  },
  {
    id: "play-3",
    name: "Three rounds",
    description: "Complete 3 eligible matches today.",
    target: 3,
    coins: 60,
  },
  {
    id: "win-1",
    name: "Today's victory",
    description: "Win 1 eligible match today.",
    target: 1,
    coins: 40,
  },
] as const;

export const DailyQuestStateSchema = z.object({
  playerId: z.string().uuid(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  nextResetAt: z.string().datetime({ offset: true }),
  balance: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  awarded: z.number().int().min(0).max(120),
  quests: z
    .array(
      z.object({
        id: z.enum(["check-in", "play-3", "win-1"]),
        progress: z.number().int().nonnegative(),
        rewardedAt: z.string().datetime({ offset: true }).nullable(),
      }),
    )
    .length(DAILY_QUESTS.length)
    .refine(
      (items) =>
        new Set(items.map((item) => item.id)).size === DAILY_QUESTS.length &&
        items.every(
          (item) =>
            item.progress <= DAILY_QUESTS.find((quest) => quest.id === item.id)!.target &&
            (!item.rewardedAt ||
              item.progress === DAILY_QUESTS.find((quest) => quest.id === item.id)!.target),
        ),
    ),
});
export type DailyQuestState = z.infer<typeof DailyQuestStateSchema>;
