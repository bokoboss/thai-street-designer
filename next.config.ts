import type { NextConfig } from "next";

const nextConfig: NextConfig = (process.env.TSD_BUILD_TARGET === "vercel" || process.env.VERCEL === "1")
  ? { distDir: ".next-vercel", typescript: { tsconfigPath: "tsconfig.vercel.json" } }
  : {};

export default nextConfig;
