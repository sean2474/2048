import { Board, SIZE } from "@/types";
import { Tile } from "./tile";

export function BoardView({ board }: { board: Board }) {
  const containerStyle: React.CSSProperties = {
    // @ts-ignore
    "--size": SIZE as unknown as string,
    "--gap": "15px",
    "--pad": "15px",
    "--tile": `calc((100% - (var(--gap) * (var(--size) + 1))) / var(--size))`,
  };

  return (
    <div
      className="relative rounded-md bg-primary w-[500px] h-[500px]"
      style={containerStyle}
    >
      <div
        className="absolute inset-0"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(var(--size), 1fr)",
          gridTemplateRows: "repeat(var(--size), 1fr)",
          gap: "var(--gap)",
          padding: "var(--pad)",
        }}
      >
        {Array.from({ length: SIZE * SIZE }).map((_, i) => (
          <div
            key={i}
            className="rounded-md bg-secondary"
          />
        ))}
      </div>

      <div className="relative w-full h-full font-bold" style={{ padding: "var(--pad)" }}>
        {board.map((t) => (
          <Tile key={t.id} tile={t} />
        ))}
      </div>
    </div>
  );
}