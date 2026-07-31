import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/spotifyDestinationGate", () => ({
  spotifyDestinationDisabledResponse: () => null,
}));

describe("GET /api/spotify/auth/callback", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("redirects with an error when state or verifier cookies are missing", async () => {
    vi.stubEnv("SPOTIFY_CLIENT_ID", "client-123");
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "secret-456");
    vi.stubEnv(
      "SPOTIFY_REDIRECT_URI",
      "http://127.0.0.1:3000/api/spotify/auth/callback",
    );

    const { GET } = await import("./route");
    const request = new NextRequest(
      "http://127.0.0.1:3000/api/spotify/auth/callback?code=abc&state=xyz",
    );
    const response = await GET(request);

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.searchParams.get("spotify_auth")).toBe("error");
    expect(location.searchParams.get("spotify_auth_error")).toBe(
      "Spotify authorization could not be verified.",
    );
  });

  it("redirects with an error when Spotify returns oauth error", async () => {
    vi.stubEnv("SPOTIFY_CLIENT_ID", "client-123");
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "secret-456");
    vi.stubEnv(
      "SPOTIFY_REDIRECT_URI",
      "http://127.0.0.1:3000/api/spotify/auth/callback",
    );

    const { GET } = await import("./route");
    const request = new NextRequest(
      "http://127.0.0.1:3000/api/spotify/auth/callback?error=access_denied",
    );
    const response = await GET(request);

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.origin).toBe("http://127.0.0.1:3000");
    expect(location.searchParams.get("spotify_auth")).toBe("error");
    expect(location.searchParams.get("spotify_auth_error")).toBe(
      "Spotify authorization was denied.",
    );
  });

  it("redirects to the redirect URI origin when the request host is localhost", async () => {
    vi.stubEnv("SPOTIFY_CLIENT_ID", "client-123");
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "secret-456");
    vi.stubEnv(
      "SPOTIFY_REDIRECT_URI",
      "http://127.0.0.1:3000/api/spotify/auth/callback",
    );

    const { GET } = await import("./route");
    const request = new NextRequest(
      "http://localhost:3000/api/spotify/auth/callback?error=access_denied",
    );
    const response = await GET(request);

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.origin).toBe("http://127.0.0.1:3000");
    expect(location.pathname).toBe("/");
    expect(location.searchParams.get("spotify_auth")).toBe("error");
  });
});
