import type { Metadata } from "next";

export const siteUrl = "https://www.2048duo.io";

export function isPublicProduction() {
  return (
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PUBLIC_APP_ENV === "production" &&
    process.env.NEXT_PUBLIC_VERCEL_ENV === "production"
  );
}

export function siteMetadata(): Metadata {
  const title = "2048 Duo";
  const description =
    "Race your friends to 1024 in real-time multiplayer. Merge tiles to send obstacles, create a private room, or find a quick match.";
  const index = isPublicProduction();
  return {
    metadataBase: new URL(siteUrl),
    title,
    description,
    referrer: "no-referrer",
    robots: { index, follow: index },
    openGraph: { title, description, siteName: title, type: "website", url: siteUrl },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ url: "/opengraph-image", alt: "2048 Duo — real-time tile battles" }],
    },
  };
}
