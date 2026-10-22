import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Shared game code is plain TypeScript in the monorepo; Next compiles it directly.
  transpilePackages: ["@ois/shared"],
};

export default nextConfig;
