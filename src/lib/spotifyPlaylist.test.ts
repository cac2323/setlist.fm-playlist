import { afterEach, describe, expect, it, vi } from "vitest";

import type { SetlistSongMatch } from "./appleMusic";
import { createSpotifyPlaylist } from "./spotifyPlaylist";
import {
  buildSpotifyPlaylistTrackUris,
  toSpotifyTrackUri,
} from "./spotifyPlaylistTracks";

function createSongMatch(position: number, selectedTrackIds: string[]): SetlistSongMatch {
  const selectedMatches = selectedTrackIds.map((id, index) => {
    const match = {
      artistName: "JAY-Z",
      confidence: 1,
      id,
      name: `Track ${id}`,
      reasons: ["Exact title match"],
    };

    return {
      confidence: 1,
      match,
      query: `Jay-Z Track ${id}`,
      reasons: match.reasons,
      segmentTitle: `Segment ${index + 1}`,
      status: "matched" as const,
    };
  });

  return {
    alternatives: [],
    confidence: selectedMatches.length > 0 ? 1 : 0,
    match: selectedMatches[0]?.match ?? null,
    query: `Jay-Z Song ${position}`,
    reasons: selectedMatches.length > 0 ? ["Matched"] : ["Unmatched"],
    selectedMatches,
    setlistSong: {
      artistName: "Jay-Z",
      name: `Song ${position}`,
      position,
    },
    status: selectedMatches.length > 0 ? "matched" : "unmatched",
  };
}

describe("Spotify playlist helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("builds Spotify track URIs from matched setlist songs", () => {
    expect(
      buildSpotifyPlaylistTrackUris([
        createSongMatch(1, ["abc123", "def456"]),
        createSongMatch(2, []),
      ]),
    ).toEqual(["spotify:track:abc123", "spotify:track:def456"]);
  });

  it("leaves existing Spotify URIs unchanged", () => {
    expect(toSpotifyTrackUri("spotify:track:abc123")).toBe("spotify:track:abc123");
    expect(toSpotifyTrackUri("abc123")).toBe("spotify:track:abc123");
  });

  it("creates a private playlist and adds tracks in order", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "playlist-1",
          name: "Show Playlist",
          external_urls: { spotify: "https://open.spotify.com/playlist/playlist-1" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await createSpotifyPlaylist({
      accessToken: "token-123",
      description: "From setlist.fm",
      name: "Show Playlist",
      uris: ["spotify:track:a", "spotify:track:b"],
    });

    expect(result).toEqual({
      id: "playlist-1",
      name: "Show Playlist",
      trackCount: 2,
      url: "https://open.spotify.com/playlist/playlist-1",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.spotify.com/v1/me/playlists",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          description: "From setlist.fm",
          name: "Show Playlist",
          public: false,
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.spotify.com/v1/playlists/playlist-1/tracks",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          uris: ["spotify:track:a", "spotify:track:b"],
        }),
      }),
    );
  });

  it("batches track adds when more than 100 URIs are provided", async () => {
    const uris = Array.from({ length: 101 }, (_, index) => `spotify:track:t${index}`);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "playlist-2", name: "Big" }),
      })
      .mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });
    vi.stubGlobal("fetch", fetchMock);

    await createSpotifyPlaylist({
      accessToken: "token-123",
      description: "desc",
      name: "Big",
      uris,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)).uris).toHaveLength(100);
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body)).uris).toHaveLength(1);
  });

  it("mentions Premium when Spotify returns 403 on playlist create", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        json: async () => ({ error: { message: "Forbidden" } }),
      }),
    );

    await expect(
      createSpotifyPlaylist({
        accessToken: "token-123",
        description: "From setlist.fm",
        name: "Show Playlist",
        uris: ["spotify:track:a"],
      }),
    ).rejects.toThrow(/Premium/i);
  });
});
