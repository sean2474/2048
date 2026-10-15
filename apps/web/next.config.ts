import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["schema", "game-core", "ui"],
};

export default nextConfig;
