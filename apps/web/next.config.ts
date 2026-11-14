import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // pnpm workspace: packages are symlinked from the repo root.
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
};

export default nextConfig;
