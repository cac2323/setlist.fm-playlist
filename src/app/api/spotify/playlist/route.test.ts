import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/spotifyDestinationGate", () => ({
  spotifyDestinationDisabledResponse: () => null,
}));

const authMocks = vi.hoisted(() => ({
  applySpotifyTokenCookies: vi.fn(),
  getSpotifyAccessTokenFromCookies: vi.fn(),
}));

const playlistMocks = vi.hoisted(() => ({
  createSpotifyPlaylist: vi.fn(),
}));

vi.mock("@/lib/spotifyAuth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/spotifyAuth")>("@/lib/spotifyAuth");
  return {
    ...actual,
    applySpotifyTokenCookies: authMocks.applySpotifyTokenCookies,
    getSpotifyAccessTokenFromCookies: authMocks.getSpotifyAccessTokenFromCookies,
  };
});

vi.mock("@/lib/spotifyPlaylist", () => ({
  createSpotifyPlaylist: playlistMocks.createSpotifyPlaylist,
}));

describe("POST /api/spotify/playlist", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 401 when Spotify is not connected", async () => {
    authMocks.getSpotifyAccessTokenFromCookies.mockResolvedValue(null);
    const { POST } = await import("./route");

    const response = await POST(
      new NextRequest("http://127.0.0.1:3000/api/spotify/playlist", {
        body: JSON.stringify({
          description: "From setlist.fm",
          name: "Show",
          uris: ["spotify:track:abc123"],
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Connect Spotify before creating a playlist.",
    });
  });

  it("creates a playlist when authorized", async () => {
    authMocks.getSpotifyAccessTokenFromCookies.mockResolvedValue({
      accessToken: "token-123",
      refreshed: false,
    });
    playlistMocks.createSpotifyPlaylist.mockResolvedValue({
      id: "playlist-1",
      name: "Show",
      trackCount: 1,
      url: "https://open.spotify.com/playlist/playlist-1",
    });

    const { POST } = await import("./route");
    const response = await POST(
      new NextRequest("http://127.0.0.1:3000/api/spotify/playlist", {
        body: JSON.stringify({
          description: "Created from a setlist.fm setlist by Setlist Playlist.",
          name: "Show",
          uris: ["spotify:track:abc123"],
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: "playlist-1",
      name: "Show",
      trackCount: 1,
      url: "https://open.spotify.com/playlist/playlist-1",
    });
    expect(playlistMocks.createSpotifyPlaylist).toHaveBeenCalledWith({
      accessToken: "token-123",
      description: "Created from a setlist.fm setlist by Setlist Playlist.",
      name: "Show",
      uris: ["spotify:track:abc123"],
    });
  });

  it("returns 400 for invalid track URIs", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new NextRequest("http://127.0.0.1:3000/api/spotify/playlist", {
        body: JSON.stringify({
          description: "From setlist.fm",
          name: "Show",
          uris: ["not-a-uri"],
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
    );

    expect(response.status).toBe(400);
    expect(playlistMocks.createSpotifyPlaylist).not.toHaveBeenCalled();
  });
});
