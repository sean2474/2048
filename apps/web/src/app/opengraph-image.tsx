import { ImageResponse } from "next/og";

export const alt = "2048 Duo — real-time tile battles";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        background: "#f6f3eb",
        color: "#282b28",
        padding: "72px",
        alignItems: "center",
        gap: "64px",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", width: "620px" }}>
        <div style={{ fontSize: 28, color: "#a4432d", marginBottom: 24 }}>MERGE. ATTACK. WIN.</div>
        <div style={{ fontSize: 100, fontWeight: 700, letterSpacing: -5 }}>2048 Duo</div>
        <div style={{ fontSize: 32, marginTop: 24, lineHeight: 1.4 }}>
          Real-time tile battles. Race your friends to 1024.
        </div>
        <div style={{ fontSize: 24, color: "#686b61", marginTop: 44 }}>www.2048duo.io</div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", width: 344, gap: 16 }}>
        {["256", "512", "1024", "VS"].map((tile, index) => (
          <div
            key={tile}
            style={{
              display: "flex",
              width: 164,
              height: 164,
              borderRadius: 24,
              alignItems: "center",
              justifyContent: "center",
              fontSize: 52,
              fontWeight: 700,
              background: ["#eee7da", "#e9ede4", "#a4432d", "#43523b"][index],
              color: index < 2 ? "#282b28" : "#ffffff",
            }}
          >
            {tile}
          </div>
        ))}
      </div>
    </div>,
    size,
  );
}
