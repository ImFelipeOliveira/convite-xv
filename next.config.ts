import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  serverExternalPackages: ['pino', 'pino-pretty'],
  partialPrefetching: true,
  // Guest CSV import caps the file at 1 MB in the action; leave headroom so it can answer in pt-BR.
  experimental: { serverActions: { bodySizeLimit: '2mb' } },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
