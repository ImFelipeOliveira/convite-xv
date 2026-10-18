import type { NextConfig } from "next";

// Version skew protection (node_modules/next/dist/docs/01-app/02-guides/self-hosting.md#version-skew):
// with a per-deployment id, a tab still running the previous build hard-reloads on its next client
// navigation instead of mixing builds. Railway passes these as build args (see Dockerfile); unset locally.
const deploymentId =
  process.env.NEXT_DEPLOYMENT_ID?.trim() ||
  process.env.RAILWAY_DEPLOYMENT_ID?.trim() ||
  process.env.RAILWAY_GIT_COMMIT_SHA?.trim() ||
  undefined;

const nextConfig: NextConfig = {
  /* config options here */
  output: 'standalone',
  deploymentId,
  cacheComponents: true,
  serverExternalPackages: ['pino', 'pino-pretty'],
  partialPrefetching: true,
  // Guest CSV import caps the file at 1 MB in the action; leave headroom so it can answer in pt-BR.
  experimental: { serverActions: { bodySizeLimit: '2mb' } },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      {
        source: '/admin/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
        ],
      },
    ]
  },
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
