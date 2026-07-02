import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // GitHub Pages: NODE_ENV=ghpages npm run build:gh → static export
  // Vercel: standard build (default, no output override)
  ...(process.env.NODE_ENV === "ghpages" ? { output: "export" } : {}),
  // basePath для GitHub Pages
  ...(process.env.BASE_PATH ? { basePath: process.env.BASE_PATH } : {}),
  // Статический экспорт требует unoptimized images
  images: {
    unoptimized: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;