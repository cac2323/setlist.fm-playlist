import type { NextConfig } from "next";

import { buildSecurityHeaders } from "./src/lib/securityHeaders";

const nextConfig: NextConfig = {
  // Spotify OAuth requires 127.0.0.1 (localhost redirect URIs are rejected).
  // Allow these hosts to load Next.js dev client/HMR so React hydrates and
  // Match buttons get click handlers.
  allowedDevOrigins: ["127.0.0.1", "localhost"],

  async headers() {
    return [
      {
        source: "/:path*",
        headers: buildSecurityHeaders({
          isDev: process.env.NODE_ENV === "development",
        }),
      },
    ];
  },
};

export default nextConfig;
