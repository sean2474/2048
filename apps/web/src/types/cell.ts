export const SIZE = 5 as const;
export type Dir = "left" | "right" | "up" | "down";

export type Cell = {
  id: number;
  value: number;
  row: number;
  col: number;
  spawned?: boolean;
  merged?: boolean;
  ghost?: boolean;
};

export type Board = Cell[];