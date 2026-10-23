import type { MetadataRoute } from "next";
import { isPublicProduction, siteUrl } from "../lib/site-metadata";

export default function sitemap(): MetadataRoute.Sitemap {
  if (!isPublicProduction()) return [];
  return ["/", "/solo", "/how-to-play", "/tutorial", "/leaderboard", "/privacy", "/terms"].map(
    (path) => ({ url: `${siteUrl}${path}` }),
  );
}
