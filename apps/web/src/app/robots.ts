import type { MetadataRoute } from "next";
import { isPublicProduction, siteUrl } from "../lib/site-metadata";

export default function robots(): MetadataRoute.Robots {
  if (!isPublicProduction()) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/auth/",
        "/login",
        "/signup",
        "/forgot-password",
        "/reset-password",
        "/settings",
        "/friends",
        "/history",
        "/find-match",
        "/play/",
        "/watch/",
        "/test",
        "/achievements",
        "/loadout",
        "/feedback",
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
