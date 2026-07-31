import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAppleMusicDeveloperToken: vi.fn(),
}));

import {
  buildAppleMusicSearchQuery,
  createMockAppleMusicMatch,
  matchSetlistSongsToAppleMusic,
  searchAppleMusicTrack,
} from "./appleMusic";
import { NormalizedSetlistSong } from "./setlistfm";

vi.mock("./appleMusicToken", () => ({
  getAppleMusicDeveloperToken: mocks.getAppleMusicDeveloperToken,
}));

const song: NormalizedSetlistSong = {
  artistName: "Jay-Z",
  name: "Encore",
  position: 1,
};

describe("Apple Music matching", () => {
  const originalAppleMusicUseMocks = process.env.APPLE_MUSIC_USE_MOCKS;

  afterEach(() => {
    process.env.APPLE_MUSIC_USE_MOCKS = originalAppleMusicUseMocks;
    mocks.getAppleMusicDeveloperToken.mockReset();
    vi.restoreAllMocks();
  });

  it("builds search queries from artist and song name", () => {
    expect(buildAppleMusicSearchQuery(song)).toBe("Jay-Z Encore");
    expect(
      buildAppleMusicSearchQuery({
        artistName: "Jay-Z",
        coverArtistName: "Oasis",
        name: "Wonderwall",
        position: 2,
      }),
    ).toBe("Oasis Wonderwall");
    expect(
      buildAppleMusicSearchQuery({
        artistName: "PinkPantheress",
        info: 'contains elements from "Stateside + Zara Larsson" remix',
        name: "Stateside",
        position: 3,
      }),
    ).toBe("PinkPantheress Stateside");
    expect(
      buildAppleMusicSearchQuery({
        artistName: "PinkPantheress",
        info: 'contains elements from "Stars + DJ Caio Prince + Adame Dj" remix',
        name: "Stars",
        position: 4,
      }),
    ).toBe("PinkPantheress Stars");
  });

  it("returns a mock match only when explicitly enabled", async () => {
    mocks.getAppleMusicDeveloperToken.mockResolvedValue(null);
    process.env.APPLE_MUSIC_USE_MOCKS = "true";

    await expect(searchAppleMusicTrack(song)).resolves.toEqual(createMockAppleMusicMatch(song));
  });

  it("throws a configuration error when Apple Music credentials are missing", async () => {
    mocks.getAppleMusicDeveloperToken.mockResolvedValue(null);
    process.env.APPLE_MUSIC_USE_MOCKS = "false";

    await expect(searchAppleMusicTrack(song)).rejects.toThrow(
      "Apple Music credentials are not configured.",
    );
  });

  it("selects the best real Apple Music search result", async () => {
    mocks.getAppleMusicDeveloperToken.mockResolvedValue("test-token");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: {
            songs: {
              data: [
                {
                  id: "karaoke-track",
                  attributes: {
                    albumName: "Karaoke Hits",
                    artistName: "Karaoke Band",
                    name: "Encore",
                  },
                },
                {
                  id: "apple-track-1",
                  attributes: {
                    albumName: "The Black Album",
                    artistName: "JAY-Z",
                    name: "Encore",
                    url: "https://music.apple.com/us/song/encore/apple-track-1",
                  },
                },
              ],
            },
          },
        }),
        { status: 200 },
      ),
    );

    const match = await searchAppleMusicTrack(song);

    expect(match).toMatchObject({
      match: {
        albumName: "The Black Album",
        artistName: "JAY-Z",
        id: "apple-track-1",
        name: "Encore",
      },
      query: "Jay-Z Encore",
      status: "matched",
    });
    expect(match.confidence).toBeGreaterThan(0.9);
    expect(match.reasons).toContain("Exact title match");
    expect(match.alternatives[0].id).toBe("karaoke-track");
    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        search: expect.stringContaining("limit=5"),
      }),
      expect.anything(),
    );
  });

  it("marks low-confidence candidates as unmatched", async () => {
    mocks.getAppleMusicDeveloperToken.mockResolvedValue("test-token");
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            results: {
              songs: {
                data: [
                  {
                    id: "wrong-track",
                    attributes: {
                      artistName: "Different Artist",
                      name: "Different Song",
                    },
                  },
                ],
              },
            },
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(searchAppleMusicTrack(song)).resolves.toMatchObject({
      confidence: 0,
      match: null,
      reasons: ["No confident Apple Music match"],
      status: "unmatched",
    });
  });

  it("searches apostrophe-normalized titles so Ruff Ryder's maps to DMX", async () => {
    mocks.getAppleMusicDeveloperToken.mockResolvedValue("test-token");
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = input instanceof URL ? input : new URL(String(input));
      const term = url.searchParams.get("term") ?? "";
      const tracks =
        term === "Ruff Ryders Anthem"
          ? [
              {
                id: "dmx-track",
                attributes: {
                  artistName: "DMX",
                  name: "Ruff Ryders Anthem",
                },
              },
            ]
          : term.includes("Jay-Z") || term.includes("JAY-Z")
            ? [
                {
                  id: "obscure-track",
                  attributes: {
                    artistName: "Sammy SlamDance & Abyss Walker",
                    name: "Ruff Ryder's Anthem",
                  },
                },
              ]
            : [];

      return Promise.resolve(
        new Response(JSON.stringify({ results: { songs: { data: tracks } } }), {
          status: 200,
        }),
      );
    });

    await expect(
      searchAppleMusicTrack({
        artistName: "Jay-Z",
        name: "Ruff Ryder's Anthem",
        position: 1,
      }),
    ).resolves.toMatchObject({
      match: { id: "dmx-track", artistName: "DMX", name: "Ruff Ryders Anthem" },
      query: "Ruff Ryders Anthem",
      status: "needs_review",
    });
  });

  it("suggests a popular title-only placeholder for review when artist match fails", async () => {
    mocks.getAppleMusicDeveloperToken.mockResolvedValue("test-token");
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = input instanceof URL ? input : new URL(String(input));
      const term = url.searchParams.get("term") ?? "";
      const tracks =
        term === "Encore"
          ? [
              {
                id: "popular-encore",
                attributes: {
                  artistName: "Different Artist",
                  name: "Encore",
                },
              },
            ]
          : [
              {
                id: "wrong-track",
                attributes: {
                  artistName: "Different Artist",
                  name: "Different Song",
                },
              },
            ];

      return Promise.resolve(
        new Response(JSON.stringify({ results: { songs: { data: tracks } } }), {
          status: 200,
        }),
      );
    });

    await expect(searchAppleMusicTrack(song)).resolves.toMatchObject({
      match: { id: "popular-encore", name: "Encore" },
      query: "Encore",
      reasons: ["Needs review", "Popular title match — artist not confirmed"],
      status: "needs_review",
    });
  });

  it("selects distinct tracks for independently matched title segments", async () => {
    mocks.getAppleMusicDeveloperToken.mockResolvedValue("test-token");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: {
            songs: {
              data: [
                {
                  id: "girls-track",
                  attributes: {
                    albumName: "The Blueprint",
                    artistName: "JAY-Z",
                    name: "Girls, Girls, Girls",
                  },
                },
                {
                  id: "bonnie-track",
                  attributes: {
                    albumName: "The Blueprint 2",
                    artistName: "JAY-Z",
                    name: "'03 Bonnie & Clyde (feat. Beyoncé Knowles)",
                  },
                },
              ],
            },
          },
        }),
        { status: 200 },
      ),
    );

    const [match] = await matchSetlistSongsToAppleMusic([
      {
        artistName: "Jay-Z",
        name: "Girls, Girls, Girls / '03 Bonnie & Clyde",
        position: 1,
      },
    ]);

    expect(match.selectedMatches).toHaveLength(2);
    expect(match.selectedMatches.map((selectedMatch) => selectedMatch.match.id)).toEqual([
      "girls-track",
      "bonnie-track",
    ]);
    expect(match.reasons).toEqual(["Matched 2 title segments"]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("selects both tracks when a medley contains a plural censored title", async () => {
    mocks.getAppleMusicDeveloperToken.mockResolvedValue("test-token");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: {
            songs: {
              data: [
                {
                  id: "big-pimpin-track",
                  attributes: {
                    artistName: "JAY-Z",
                    name: "Big Pimpin'",
                  },
                },
                {
                  id: "paris-track",
                  attributes: {
                    artistName: "JAY-Z & Kanye West",
                    name: "Ni**as In Paris",
                  },
                },
              ],
            },
          },
        }),
        { status: 200 },
      ),
    );

    const [match] = await matchSetlistSongsToAppleMusic([
      {
        artistName: "Jay-Z",
        name: "Niggas in Paris / Big Pimpin'",
        position: 1,
      },
    ]);

    expect(match.selectedMatches.map((selectedMatch) => selectedMatch.match.id)).toEqual([
      "paris-track",
      "big-pimpin-track",
    ]);
    expect(match.reasons).toEqual(["Matched 2 title segments"]);
  });

  it("keeps a slash title as one match when segments resolve to the same track", async () => {
    mocks.getAppleMusicDeveloperToken.mockResolvedValue("test-token");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: {
            songs: {
              data: [
                {
                  id: "slash-track",
                  attributes: {
                    artistName: "Example Artist",
                    name: "Love / Hate",
                  },
                },
              ],
            },
          },
        }),
        { status: 200 },
      ),
    );

    const [match] = await matchSetlistSongsToAppleMusic([
      { artistName: "Example Artist", name: "Love / Hate", position: 1 },
    ]);

    expect(match.selectedMatches).toHaveLength(1);
    expect(match.match?.id).toBe("slash-track");
  });

  it("keeps a confident slash segment and a title-only review placeholder for the other", async () => {
    mocks.getAppleMusicDeveloperToken.mockResolvedValue("test-token");
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = input instanceof URL ? input : new URL(String(input));
      const term = url.searchParams.get("term") ?? "";
      const tracks =
        term === "Mereba Bet"
          ? [
              {
                id: "bet-track",
                attributes: {
                  artistName: "Mereba",
                  name: "Bet",
                },
              },
            ]
          : term === "You Send Me" || term === "Mereba You Send Me"
            ? [
                {
                  id: "sam-cooke-track",
                  attributes: {
                    artistName: "Sam Cooke",
                    name: "You Send Me",
                  },
                },
              ]
            : [];

      return Promise.resolve(
        new Response(JSON.stringify({ results: { songs: { data: tracks } } }), {
          status: 200,
        }),
      );
    });

    const [match] = await matchSetlistSongsToAppleMusic([
      {
        artistName: "Mereba",
        name: "Bet / You Send Me",
        position: 1,
      },
    ]);

    expect(match.status).toBe("matched");
    expect(match.match?.id).toBe("bet-track");
    expect(match.selectedMatches).toHaveLength(2);
    expect(match.selectedMatches.map((selectedMatch) => selectedMatch.segmentTitle)).toEqual([
      "Bet",
      "You Send Me",
    ]);
    expect(match.selectedMatches[0]).toMatchObject({
      match: { id: "bet-track" },
      status: "matched",
    });
    expect(match.selectedMatches[1]).toMatchObject({
      match: { id: "sam-cooke-track", artistName: "Sam Cooke" },
      status: "needs_review",
    });
    expect(match.reasons).toEqual([
      "Matched 1 of 2 title segments",
      "1 segment needs review",
    ]);
  });

  it("searches an uncensored title and matches the Apple Music catalog title", async () => {
    mocks.getAppleMusicDeveloperToken.mockResolvedValue("test-token");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: {
            songs: {
              data: [
                {
                  id: "originator-track",
                  attributes: {
                    artistName: "JAY-Z",
                    name: "Nigga What, Nigga Who (Originator 99)",
                  },
                },
              ],
            },
          },
        }),
        { status: 200 },
      ),
    );

    const match = await searchAppleMusicTrack({
      artistName: "Jay-Z",
      name: "Ni**a What, Ni**a Who",
      position: 1,
    });

    expect(match.match?.id).toBe("originator-track");
    expect(match.query).toBe("Jay-Z Nigga What, Nigga Who");
    expect(match.reasons).toContain("Exact title match");
  });

  it("matches an Apple Music asterisk-censored glued title from an uncensored setlist name", async () => {
    mocks.getAppleMusicDeveloperToken.mockResolvedValue("test-token");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: {
            songs: {
              data: [
                {
                  id: "fuckwithme-track",
                  attributes: {
                    albumName: "Magna Carta... Holy Grail",
                    artistName: "JAY-Z",
                    name: "F*ckwithmeyouknowigotit",
                  },
                },
              ],
            },
          },
        }),
        { status: 200 },
      ),
    );

    const match = await searchAppleMusicTrack({
      artistName: "Jay-Z",
      name: "fuckwithmeyouknowigotit",
      position: 1,
    });

    expect(match.match?.id).toBe("fuckwithme-track");
    expect(match.query).toBe("Jay-Z f*ckwithmeyouknowigotit");
    expect(match.reasons).toContain("Exact title match");
  });

  it("keeps requested Illegal remixes separate from the original track", async () => {
    mocks.getAppleMusicDeveloperToken.mockResolvedValue("test-token");
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = input instanceof URL ? input : new URL(String(input));
      const term = url.searchParams.get("term") ?? "";
      const tracks = term.includes("Four Tet Remix")
        ? [
            {
              id: "illegal-original",
              attributes: {
                artistName: "PinkPantheress",
                name: "Illegal",
              },
            },
            {
              id: "illegal-four-tet",
              attributes: {
                artistName: "PinkPantheress",
                name: "Illegal (Four Tet Remix)",
              },
            },
          ]
        : term.includes("Nia Archives remix")
          ? [
              {
                id: "illegal-original",
                attributes: {
                  artistName: "PinkPantheress",
                  name: "Illegal",
                },
              },
              {
                id: "illegal-nia-archives",
                attributes: {
                  artistName: "PinkPantheress",
                  name: "Illegal (Nia Archives Remix)",
                },
              },
            ]
          : [
              {
                id: "illegal-original",
                attributes: {
                  artistName: "PinkPantheress",
                  name: "Illegal",
                },
              },
            ];

      return Promise.resolve(
        new Response(
          JSON.stringify({
            results: {
              songs: {
                data: tracks,
              },
            },
          }),
          { status: 200 },
        ),
      );
    });

    const matches = await matchSetlistSongsToAppleMusic([
      {
        artistName: "PinkPantheress",
        info: "Four Tet Remix",
        name: "Illegal",
        position: 1,
      },
      {
        artistName: "PinkPantheress",
        name: "Illegal",
        position: 2,
      },
      {
        artistName: "PinkPantheress",
        info: "Nia Archives remix",
        name: "Illegal",
        position: 3,
      },
    ]);

    expect(matches.map((match) => match.match?.id)).toEqual([
      "illegal-four-tet",
      "illegal-original",
      "illegal-nia-archives",
    ]);
    expect(matches.map((match) => match.query)).toEqual([
      "PinkPantheress Illegal Four Tet Remix",
      "PinkPantheress Illegal",
      "PinkPantheress Illegal Nia Archives remix",
    ]);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("returns partial matches when Apple Music rate limits later songs", async () => {
    mocks.getAppleMusicDeveloperToken.mockResolvedValue("test-token");
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes(encodeURIComponent("Encore")) || url.includes("Encore")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              results: {
                songs: {
                  data: [
                    {
                      id: "apple-track-1",
                      attributes: {
                        artistName: "JAY-Z",
                        name: "Encore",
                      },
                    },
                  ],
                },
              },
            }),
            { status: 200 },
          ),
        );
      }

      return Promise.resolve(new Response("API capacity exceeded", { status: 429 }));
    });

    const matches = await matchSetlistSongsToAppleMusic([
      song,
      { artistName: "Jay-Z", name: "Song Cry", position: 2 },
      { artistName: "Jay-Z", name: "Izzo (H.O.V.A.)", position: 3 },
    ]);

    expect(matches).toHaveLength(3);
    expect(matches[0]).toMatchObject({ status: "matched" });
    expect(
      matches.slice(1).every(
        (match) =>
          match.status === "unmatched" &&
          match.reasons.some((reason) => reason.includes("Apple Music API capacity")),
      ),
    ).toBe(true);
  });

  it("retries a transient Apple Music 429 and then matches", async () => {
    mocks.getAppleMusicDeveloperToken.mockResolvedValue("test-token");
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response("API capacity exceeded", {
          status: 429,
          headers: { "Retry-After": "1" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: {
              songs: {
                data: [
                  {
                    id: "apple-track-1",
                    attributes: {
                      artistName: "JAY-Z",
                      name: "Encore",
                    },
                  },
                ],
              },
            },
          }),
          { status: 200 },
        ),
      );

    await expect(searchAppleMusicTrack(song)).resolves.toMatchObject({
      status: "matched",
      match: { id: "apple-track-1", name: "Encore" },
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
