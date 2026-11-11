import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * CSP allows what PayPal's checkout needs plus AG Grid's inline styles and Google Fonts. It ships report-only so
 * checkout cannot break; set CSP_MODE=enforce once /store shows no violations in the console.
 */
const PAYPAL = "https://*.paypal.com https://*.paypalobjects.com";
const csp = [
  "default-src 'self'",
  // Next injects small inline scripts; 'unsafe-eval' is only for the dev server's hot reload.
  `script-src 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval' " : ""}${PAYPAL}`,
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com ${PAYPAL}`,
  `img-src 'self' data: blob: ${PAYPAL}`,
  "font-src 'self' data: https://fonts.gstatic.com https://*.paypalobjects.com",
  `connect-src 'self' ${PAYPAL}${isDev ? " ws://localhost:* http://localhost:*" : ""}`,
  `frame-src 'self' ${PAYPAL}`,
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  `form-action 'self' ${PAYPAL}`,
  "object-src 'none'",
].join("; ");

const enforce = process.env.CSP_MODE === "enforce";

const securityHeaders = [
  { key: enforce ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self \"https://www.paypal.com\" \"https://www.sandbox.paypal.com\"), interest-cohort=()" },
  // Older browsers that ignore CSP frame-ancestors.
  { key: "X-Frame-Options", value: "DENY" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
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
