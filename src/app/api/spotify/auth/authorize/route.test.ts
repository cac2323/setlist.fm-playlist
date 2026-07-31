import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/spotifyDestinationGate", () => ({
  spotifyDestinationDisabledResponse: () => null,
}));

describe("GET /api/spotify/auth/authorize", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("redirects to Spotify when handshake cookies are present", async () => {
    vi.stubEnv("SPOTIFY_CLIENT_ID", "client-123");
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "secret-456");
    vi.stubEnv(
      "SPOTIFY_REDIRECT_URI",
      "http://127.0.0.1:3000/api/spotify/auth/callback",
    );

    const { GET } = await import("./route");
    const request = new NextRequest("http://127.0.0.1:3000/api/spotify/auth/authorize", {
      headers: {
        cookie: "spotify_oauth_state=state-abc; spotify_oauth_verifier=verifier-xyz",
      },
    });
    const response = await GET(request);

    expect(response.status).toBe(307);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("https://accounts.spotify.com/authorize?");
    expect(location).toContain("client_id=client-123");
    expect(location).toContain("state=state-abc");
    expect(location).toContain("code_challenge_method=S256");
  });

  it("sends the user back to login when handshake cookies are missing", async () => {
    vi.stubEnv("SPOTIFY_CLIENT_ID", "client-123");
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "secret-456");
    vi.stubEnv(
      "SPOTIFY_REDIRECT_URI",
      "http://127.0.0.1:3000/api/spotify/auth/callback",
    );

    const { GET } = await import("./route");
    const response = await GET(
      new NextRequest("http://127.0.0.1:3000/api/spotify/auth/authorize"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://127.0.0.1:3000/api/spotify/auth/login",
    );
  });
});
