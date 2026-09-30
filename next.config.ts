import type { NextConfig } from "next";

const target=process.env.TSD_BUILD_TARGET;
const nextConfig: NextConfig =
  target === "pages"
    ? {
        output: "export",
        distDir: ".next-pages",
        basePath: "/thai-street-designer",
        assetPrefix: "/thai-street-designer",
        trailingSlash: true,
        images: { unoptimized: true },
        typescript: { tsconfigPath: "tsconfig.vercel.json" },
      }
    : (target === "vercel" || process.env.VERCEL === "1")
      ? { distDir: ".next-vercel", typescript: { tsconfigPath: "tsconfig.vercel.json" } }
      : {};

export default nextConfig;
