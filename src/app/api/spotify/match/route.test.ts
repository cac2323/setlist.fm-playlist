import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  applySpotifyTokenCookies: vi.fn((response: Response) => response),
  getSpotifyAccessTokenFromCookies: vi.fn(),
  matchSetlistSongsToSpotify: vi.fn(),
}));

vi.mock("@/lib/spotify", () => ({
  SpotifyApiError: class SpotifyApiError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "SpotifyApiError";
    }
  },
  matchSetlistSongsToSpotify: mocks.matchSetlistSongsToSpotify,
}));

vi.mock("@/lib/spotifyAuth", () => ({
  applySpotifyTokenCookies: mocks.applySpotifyTokenCookies,
  getSpotifyAccessTokenFromCookies: mocks.getSpotifyAccessTokenFromCookies,
}));

vi.mock("@/lib/spotifyDestinationGate", () => ({
  spotifyDestinationDisabledResponse: () => null,
}));

import { POST } from "./route";

describe("POST /api/spotify/match", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns Spotify matches using the signed-in user token", async () => {
    mocks.getSpotifyAccessTokenFromCookies.mockResolvedValue({
      accessToken: "user-access-token",
      refreshed: false,
    });
    mocks.matchSetlistSongsToSpotify.mockResolvedValue([
      {
        alternatives: [],
        confidence: 1,
        match: {
          artistName: "JAY-Z",
          confidence: 1,
          id: "spotify-track-1",
          name: "Encore",
          reasons: ["Exact title match", "Artist match"],
        },
        query: "Jay-Z Encore",
        reasons: ["Exact title match", "Artist match"],
        selectedMatches: [],
        setlistSong: { artistName: "Jay-Z", name: "Encore", position: 1 },
        status: "matched",
      },
    ]);

    const response = await POST(
      new Request("http://127.0.0.1:3000/api/spotify/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          songs: [{ artistName: "Jay-Z", name: "Encore", position: 1 }],
        }),
      }) as never,
    );

    expect(response.status).toBe(200);
    expect(mocks.matchSetlistSongsToSpotify).toHaveBeenCalledWith(
      [{ artistName: "Jay-Z", name: "Encore", position: 1 }],
      { accessToken: "user-access-token" },
    );
    await expect(response.json()).resolves.toMatchObject({
      matches: [{ match: { id: "spotify-track-1" } }],
    });
  });

  it("returns 400 for invalid payloads", async () => {
    const response = await POST(
      new Request("http://127.0.0.1:3000/api/spotify/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songs: "nope" }),
      }) as never,
    );

    expect(response.status).toBe(400);
  });
});
