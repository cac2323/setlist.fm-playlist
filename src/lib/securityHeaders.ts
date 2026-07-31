export type SecurityHeader = {
  key: string;
  value: string;
};

type BuildSecurityHeadersOptions = {
  isDev?: boolean;
};

/**
 * Browser CSP for this app:
 * - MusicKit script + Apple authorize/API
 * - Same-origin API for Spotify (browser never talks to Spotify directly)
 * - Inline styles for Next/CSS modules; eval only in development
 */
export function buildContentSecurityPolicy(options: BuildSecurityHeadersOptions = {}) {
  const isDev = options.isDev ?? process.env.NODE_ENV === "development";

  const scriptSrc = [
    "'self'",
    "https://js-cdn.music.apple.com",
    "'unsafe-inline'",
    ...(isDev ? ["'unsafe-eval'"] : []),
  ];

  const connectSrc = [
    "'self'",
    "https://api.music.apple.com",
    "https://amp-api.music.apple.com",
    "https://authorize.music.apple.com",
    // MusicKit may call additional Apple endpoints during authorize/library writes.
    "https://*.apple.com",
    "https://*.mzstatic.com",
  ];

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${connectSrc.join(" ")}`,
    "frame-src https://authorize.music.apple.com",
    "worker-src 'self' blob:",
    "form-action 'self' https://accounts.spotify.com",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ];

  return directives.join("; ");
}

export function buildSecurityHeaders(
  options: BuildSecurityHeadersOptions = {},
): SecurityHeader[] {
  const isDev = options.isDev ?? process.env.NODE_ENV === "development";

  const headers: SecurityHeader[] = [
    {
      key: "Content-Security-Policy",
      value: buildContentSecurityPolicy({ isDev }),
    },
    {
      key: "X-Content-Type-Options",
      value: "nosniff",
    },
    {
      key: "Referrer-Policy",
      value: "strict-origin-when-cross-origin",
    },
    {
      key: "X-Frame-Options",
      value: "DENY",
    },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=()",
    },
    // MusicKit authorize uses a popup; allow popups without fully isolating the opener.
    {
      key: "Cross-Origin-Opener-Policy",
      value: "same-origin-allow-popups",
    },
  ];

  if (!isDev) {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    });
  }

  return headers;
}
