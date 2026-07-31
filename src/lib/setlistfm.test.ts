import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchSetlistById, normalizeSetlist, SetlistFmApiError } from "./setlistfm";

describe("normalizeSetlist", () => {
  it("flattens setlist.fm sets into ordered songs", () => {
    expect(
      normalizeSetlist({
        id: "3b497c60",
        eventDate: "13-07-2026",
        artist: { name: "Jay-Z" },
        venue: {
          name: "Yankee Stadium",
          city: {
            name: "The Bronx",
            stateCode: "NY",
            country: { code: "US", name: "United States" },
          },
        },
        sets: {
          set: [
            {
              song: [{ name: "Public Service Announcement" }, { name: "Run This Town" }],
            },
            {
              song: [
                {
                  name: "Wonderwall",
                  cover: { name: "Oasis" },
                  info: "snippet",
                },
              ],
            },
          ],
        },
      }),
    ).toEqual({
      artistName: "Jay-Z",
      eventDate: "13-07-2026",
      id: "3b497c60",
      songs: [
        {
          artistName: "Jay-Z",
          coverArtistName: undefined,
          info: undefined,
          name: "Public Service Announcement",
          position: 1,
        },
        {
          artistName: "Jay-Z",
          coverArtistName: undefined,
          info: undefined,
          name: "Run This Town",
          position: 2,
        },
        {
          artistName: "Jay-Z",
          coverArtistName: "Oasis",
          info: "snippet",
          name: "Wonderwall",
          position: 3,
        },
      ],
      venue: {
        cityName: "The Bronx",
        countryCode: "US",
        name: "Yankee Stadium",
        stateCode: "NY",
      },
    });
  });
});

describe("fetchSetlistById", () => {
  const originalApiKey = process.env.SETLISTFM_API_KEY;

  afterEach(() => {
    process.env.SETLISTFM_API_KEY = originalApiKey;
    vi.restoreAllMocks();
  });

  it("fails before making a request when the API key is missing", async () => {
    delete process.env.SETLISTFM_API_KEY;
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(fetchSetlistById("3b497c60")).rejects.toThrow(SetlistFmApiError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("normalizes a successful API response", async () => {
    process.env.SETLISTFM_API_KEY = "test-api-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "3b497c60",
          artist: { name: "Jay-Z" },
          sets: {
            set: [{ song: [{ name: "Encore" }] }],
          },
        }),
        { status: 200 },
      ),
    );

    await expect(fetchSetlistById("3b497c60")).resolves.toMatchObject({
      artistName: "Jay-Z",
      id: "3b497c60",
      songs: [{ name: "Encore", position: 1 }],
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.setlist.fm/rest/1.0/setlist/3b497c60",
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: "application/json",
          "x-api-key": "test-api-key",
        }),
      }),
    );
  });
});
