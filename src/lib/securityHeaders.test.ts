import { describe, expect, it } from "vitest";

import { buildContentSecurityPolicy, buildSecurityHeaders } from "./securityHeaders";

describe("securityHeaders", () => {
  it("allows MusicKit and Apple authorize endpoints in CSP", () => {
    const csp = buildContentSecurityPolicy({ isDev: false });

    expect(csp).toContain("script-src 'self' https://js-cdn.music.apple.com 'unsafe-inline'");
    expect(csp).toContain("https://api.music.apple.com");
    expect(csp).toContain("https://authorize.music.apple.com");
    expect(csp).toContain("frame-src https://authorize.music.apple.com");
    expect(csp).toContain("form-action 'self' https://accounts.spotify.com");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it("allows eval only in development for Next.js tooling", () => {
    const csp = buildContentSecurityPolicy({ isDev: true });

    expect(csp).toContain("'unsafe-eval'");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });

  it("sets baseline browser hardening headers", () => {
    const headers = Object.fromEntries(
      buildSecurityHeaders({ isDev: false }).map((header) => [header.key, header.value]),
    );

    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Cross-Origin-Opener-Policy"]).toBe("same-origin-allow-popups");
    expect(headers["Strict-Transport-Security"]).toContain("max-age=");
    expect(headers["Content-Security-Policy"]).toContain("default-src 'self'");
  });

  it("omits HSTS in development", () => {
    const headers = buildSecurityHeaders({ isDev: true });

    expect(headers.some((header) => header.key === "Strict-Transport-Security")).toBe(false);
  });
});
