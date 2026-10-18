import type { NextConfig } from "next";

// Version skew protection (node_modules/next/dist/docs/01-app/02-guides/self-hosting.md#version-skew):
// with a per-deployment id, a tab still running the previous build hard-reloads on its next client
// navigation instead of mixing builds. Railway passes these as build args (see Dockerfile); unset locally.
const deploymentId =
  process.env.NEXT_DEPLOYMENT_ID?.trim() ||
  process.env.RAILWAY_DEPLOYMENT_ID?.trim() ||
  process.env.RAILWAY_GIT_COMMIT_SHA?.trim() ||
  undefined;

// Browsers drop HSTS received over http anyway, but sending it only from a production build whose public
// URL is https keeps `next dev` and the e2e build (`next start` on http://localhost) free of it.
// Evaluated at build time (headers end up in the routes manifest); the Dockerfile passes APP_URL then.
function sendsHsts(): boolean {
  return process.env.NODE_ENV === 'production' && (process.env.APP_URL?.trim() ?? '').startsWith('https://')
}

// The site uses none of these: deny them to every page and to anything embedded in it.
const PERMISSIONS_POLICY = [
  'camera=()',
  'microphone=()',
  'geolocation=()',
  'payment=()',
  'usb=()',
  'serial=()',
  'bluetooth=()',
  'hid=()',
  'midi=()',
  'magnetometer=()',
  'gyroscope=()',
  'accelerometer=()',
  'display-capture=()',
  'browsing-topics=()',
].join(', ')

const nextConfig: NextConfig = {
  /* config options here */
  output: 'standalone',
  deploymentId,
  cacheComponents: true,
  serverExternalPackages: ['pino', 'pino-pretty'],
  partialPrefetching: true,
  // Guest CSV import caps the file at 1 MB in the action; leave headroom so it can answer in pt-BR.
  experimental: { serverActions: { bodySizeLimit: '2mb' } },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          ...(sendsHsts() ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }] : []),
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: PERMISSIONS_POLICY },
          // no page may be framed (clickjacking on the invite's Pix code, the panel). Deliberately no
          // script-src/default-src: Next streams inline scripts, so a full CSP would need nonces.
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'" },
        ],
      },
      {
        // the invite URL carries the guest token: never send it as a referrer, not even the origin's path
        source: '/c/:path*',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
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
