import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined,
  })),
}));

vi.mock("@/lib/spotifyDestinationGate", () => ({
  spotifyDestinationDisabledResponse: () => null,
}));

describe("GET /api/spotify/auth/status", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("returns disconnected when cookies are missing", async () => {
    vi.stubEnv("SPOTIFY_CLIENT_ID", "client-123");
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "secret-456");
    vi.stubEnv(
      "SPOTIFY_REDIRECT_URI",
      "http://127.0.0.1:3000/api/spotify/auth/callback",
    );

    const { GET } = await import("./route");
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ connected: false });
  });

  it("returns 503 when credentials are missing", async () => {
    vi.stubEnv("SPOTIFY_CLIENT_ID", "");
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "");
    vi.stubEnv("SPOTIFY_REDIRECT_URI", "");

    const { GET } = await import("./route");
    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ connected: false });
  });
});
