import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Для production-сервера: output: "standalone"
  // Для GitHub Pages: output: "export" (запускается через NODE_ENV=ghpages npm run build:gh)
  output: process.env.NODE_ENV === "ghpages" ? "export" : "standalone",
  // basePath для GitHub Pages — задаётся при деплое
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