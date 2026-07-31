import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSpotifyClientCredentialsToken: vi.fn(),
}));

vi.mock("./spotifyToken", () => ({
  getSpotifyClientCredentialsToken: mocks.getSpotifyClientCredentialsToken,
}));

import {
  buildSpotifySearchQuery,
  createMockSpotifyMatch,
  matchSetlistSongsToSpotify,
  searchSpotifyCatalog,
  searchSpotifyTrack,
} from "./spotify";
import { NormalizedSetlistSong } from "./setlistfm";

const song: NormalizedSetlistSong = {
  artistName: "Jay-Z",
  name: "Encore",
  position: 1,
};

describe("Spotify matching", () => {
  const originalSpotifyUseMocks = process.env.SPOTIFY_USE_MOCKS;

  afterEach(() => {
    process.env.SPOTIFY_USE_MOCKS = originalSpotifyUseMocks;
    mocks.getSpotifyClientCredentialsToken.mockReset();
    vi.restoreAllMocks();
  });

  it("builds search queries from artist and song name", () => {
    expect(buildSpotifySearchQuery(song)).toBe("Jay-Z Encore");
    expect(
      buildSpotifySearchQuery({
        artistName: "Jay-Z",
        coverArtistName: "Oasis",
        name: "Wonderwall",
        position: 2,
      }),
    ).toBe("Oasis Wonderwall");
  });

  it("returns a mock match only when explicitly enabled", async () => {
    mocks.getSpotifyClientCredentialsToken.mockResolvedValue(null);
    process.env.SPOTIFY_USE_MOCKS = "true";

    await expect(searchSpotifyTrack(song)).resolves.toEqual(createMockSpotifyMatch(song));
  });

  it("returns catalog tracks for a free-text search query", async () => {
    mocks.getSpotifyClientCredentialsToken.mockResolvedValue("spotify-token");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          tracks: {
            items: [
              {
                id: "spotify-track-1",
                name: "Encore",
                artists: [{ name: "JAY-Z" }],
                album: { name: "The Black Album" },
                external_urls: { spotify: "https://open.spotify.com/track/encore" },
              },
            ],
          },
        }),
        { status: 200 },
      ),
    );

    await expect(searchSpotifyCatalog("Jay-Z Encore")).resolves.toEqual([
      {
        albumName: "The Black Album",
        artistName: "JAY-Z",
        id: "spotify-track-1",
        name: "Encore",
        url: "https://open.spotify.com/track/encore",
      },
    ]);
  });

  it("throws a configuration error when Spotify credentials are missing", async () => {
    mocks.getSpotifyClientCredentialsToken.mockResolvedValue(null);
    process.env.SPOTIFY_USE_MOCKS = "false";

    await expect(searchSpotifyTrack(song)).rejects.toThrow(
      "Spotify credentials are not configured.",
    );
  });

  it("selects the best Spotify search result", async () => {
    mocks.getSpotifyClientCredentialsToken.mockResolvedValue("spotify-token");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          tracks: {
            items: [
              {
                id: "karaoke-track",
                name: "Encore",
                artists: [{ name: "Karaoke Band" }],
                album: { name: "Karaoke Hits" },
                external_urls: { spotify: "https://open.spotify.com/track/karaoke" },
              },
              {
                id: "spotify-track-1",
                name: "Encore",
                artists: [{ name: "JAY-Z" }],
                album: { name: "The Black Album" },
                external_urls: { spotify: "https://open.spotify.com/track/encore" },
              },
            ],
          },
        }),
        { status: 200 },
      ),
    );

    const match = await searchSpotifyTrack(song);

    expect(match.status).toBe("matched");
    expect(match.match?.id).toBe("spotify-track-1");
    expect(match.match?.artistName).toBe("JAY-Z");
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toContain("market=US");
  });

  it("uses a provided user token without forcing a market", async () => {
    mocks.getSpotifyClientCredentialsToken.mockResolvedValue("should-not-use");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          tracks: {
            items: [
              {
                id: "spotify-track-1",
                name: "Encore",
                artists: [{ name: "JAY-Z" }],
                album: { name: "The Black Album" },
              },
            ],
          },
        }),
        { status: 200 },
      ),
    );

    const match = await searchSpotifyTrack(song, { accessToken: "user-token" });

    expect(match.match?.id).toBe("spotify-track-1");
    expect(mocks.getSpotifyClientCredentialsToken).not.toHaveBeenCalled();
    const calledUrl = String(vi.mocked(fetch).mock.calls[0]?.[0]);
    expect(calledUrl).not.toContain("market=");
    expect(vi.mocked(fetch).mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        Authorization: "Bearer user-token",
      }),
    });
  });

  it("matches a list of songs in order", async () => {
    mocks.getSpotifyClientCredentialsToken.mockResolvedValue("spotify-token");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      const query = new URL(url).searchParams.get("q") ?? "";

      if (query.includes("Run This Town")) {
        return new Response(
          JSON.stringify({
            tracks: {
              items: [
                {
                  id: "run-this-town",
                  name: "Run This Town",
                  artists: [{ name: "JAY-Z" }, { name: "Rihanna" }, { name: "Kanye West" }],
                  album: { name: "The Blueprint 3" },
                },
              ],
            },
          }),
          { status: 200 },
        );
      }

      return new Response(
        JSON.stringify({
          tracks: {
            items: [
              {
                id: "encore-track",
                name: "Encore",
                artists: [{ name: "JAY-Z" }],
                album: { name: "The Black Album" },
              },
            ],
          },
        }),
        { status: 200 },
      );
    });

    const matches = await matchSetlistSongsToSpotify([
      song,
      { artistName: "Jay-Z", name: "Run This Town", position: 2 },
    ]);

    expect(matches.map((match) => match.match?.id)).toEqual(["encore-track", "run-this-town"]);
  });

  it("retries a transient Spotify 429 and then searches the catalog", async () => {
    mocks.getSpotifyClientCredentialsToken.mockResolvedValue("spotify-token");
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response("Too Many Requests", {
          status: 429,
          headers: { "Retry-After": "1" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tracks: {
              items: [
                {
                  id: "spotify-track-1",
                  name: "Encore",
                  artists: [{ name: "JAY-Z" }],
                  album: { name: "The Black Album" },
                },
              ],
            },
          }),
          { status: 200 },
        ),
      );

    await expect(searchSpotifyCatalog("Jay-Z Encore")).resolves.toEqual([
      {
        albumName: "The Black Album",
        artistName: "JAY-Z",
        id: "spotify-track-1",
        name: "Encore",
        url: undefined,
      },
    ]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
