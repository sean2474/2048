export type AchievementId = 
  | "first_win"
  | "combo_master"
  | "speed_demon"
  | "tile_2048"

export interface Achievement {
  id: AchievementId;
  title: string;
  description: string;
  icon: string;
  category: "gameplay" | "social" | "progression";
  requirement: {
    type: "win_games" | "reach_tile" | "combo" | "speed";
    value: number;
  };
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "first_win",
    title: "First Win",
    description: "Win your first game!",
    icon: "trophy",
    category: "gameplay",
    requirement: { type: "win_games", value: 1 }
  },
];