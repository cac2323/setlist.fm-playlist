import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/spotifyDestinationGate", () => ({
  spotifyDestinationDisabledResponse: () => null,
}));

describe("GET /api/spotify/auth/login", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("returns 503 when Spotify credentials are missing", async () => {
    vi.stubEnv("SPOTIFY_CLIENT_ID", "");
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "");
    vi.stubEnv("SPOTIFY_REDIRECT_URI", "");

    const { GET } = await import("./route");
    const response = await GET(
      new NextRequest("http://127.0.0.1:3000/api/spotify/auth/login", {
        headers: { host: "127.0.0.1:3000" },
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Spotify credentials are not configured.",
    });
  });

  it("sets PKCE cookies and redirects same-origin to authorize", async () => {
    vi.stubEnv("SPOTIFY_CLIENT_ID", "client-123");
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "secret-456");
    vi.stubEnv(
      "SPOTIFY_REDIRECT_URI",
      "http://127.0.0.1:3000/api/spotify/auth/callback",
    );

    const { GET } = await import("./route");
    const response = await GET(
      new NextRequest("http://127.0.0.1:3000/api/spotify/auth/login", {
        headers: { host: "127.0.0.1:3000" },
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://127.0.0.1:3000/api/spotify/auth/authorize",
    );

    const setCookie = response.headers.getSetCookie?.() ?? [];
    expect(setCookie.some((value) => value.startsWith("spotify_oauth_state="))).toBe(true);
    expect(setCookie.some((value) => value.startsWith("spotify_oauth_verifier="))).toBe(true);
  });

  it("canonicalizes localhost to the redirect URI host before setting cookies", async () => {
    vi.stubEnv("SPOTIFY_CLIENT_ID", "client-123");
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "secret-456");
    vi.stubEnv(
      "SPOTIFY_REDIRECT_URI",
      "http://127.0.0.1:3000/api/spotify/auth/callback",
    );

    const { GET } = await import("./route");
    const response = await GET(
      new NextRequest("http://localhost:3000/api/spotify/auth/login", {
        headers: { host: "localhost:3000" },
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://127.0.0.1:3000/api/spotify/auth/login",
    );
  });
});
