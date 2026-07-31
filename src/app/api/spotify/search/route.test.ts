import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/spotifyDestinationGate", () => ({
  spotifyDestinationDisabledResponse: () => null,
}));

const mocks = vi.hoisted(() => ({
  applySpotifyTokenCookies: vi.fn(),
  getSpotifyAccessTokenFromCookies: vi.fn(),
  searchSpotifyCatalog: vi.fn(),
}));

vi.mock("@/lib/spotifyAuth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/spotifyAuth")>("@/lib/spotifyAuth");
  return {
    ...actual,
    applySpotifyTokenCookies: mocks.applySpotifyTokenCookies,
    getSpotifyAccessTokenFromCookies: mocks.getSpotifyAccessTokenFromCookies,
  };
});

vi.mock("@/lib/spotify", () => ({
  SpotifyApiError: class SpotifyApiError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "SpotifyApiError";
    }
  },
  searchSpotifyCatalog: mocks.searchSpotifyCatalog,
}));

describe("POST /api/spotify/search", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 400 for an empty query", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new NextRequest("http://127.0.0.1:3000/api/spotify/search", {
        body: JSON.stringify({ query: "   " }),
        method: "POST",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid search query." });
  });

  it("returns catalog tracks for a valid query", async () => {
    mocks.getSpotifyAccessTokenFromCookies.mockResolvedValue({
      accessToken: "user-token",
      refreshed: false,
    });
    mocks.searchSpotifyCatalog.mockResolvedValue([
      {
        albumName: "The Black Album",
        artistName: "JAY-Z",
        id: "spotifyTrack1",
        name: "Encore",
      },
    ]);

    const { POST } = await import("./route");
    const response = await POST(
      new NextRequest("http://127.0.0.1:3000/api/spotify/search", {
        body: JSON.stringify({ query: "Jay-Z Encore" }),
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.searchSpotifyCatalog).toHaveBeenCalledWith("Jay-Z Encore", {
      accessToken: "user-token",
    });
    await expect(response.json()).resolves.toEqual({
      tracks: [
        {
          albumName: "The Black Album",
          artistName: "JAY-Z",
          id: "spotifyTrack1",
          name: "Encore",
        },
      ],
    });
  });

  it("searches without a user token when cookies are missing", async () => {
    mocks.getSpotifyAccessTokenFromCookies.mockResolvedValue(null);
    mocks.searchSpotifyCatalog.mockResolvedValue([]);

    const { POST } = await import("./route");
    const response = await POST(
      new NextRequest("http://127.0.0.1:3000/api/spotify/search", {
        body: JSON.stringify({ query: "Encore" }),
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.searchSpotifyCatalog).toHaveBeenCalledWith("Encore", {
      accessToken: undefined,
    });
  });
});
