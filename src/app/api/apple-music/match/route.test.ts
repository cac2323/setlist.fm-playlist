import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { POST } from "./route";

vi.mock("@/lib/appleMusic", () => ({
  AppleMusicApiError: class AppleMusicApiError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "AppleMusicApiError";
    }
  },
  matchSetlistSongsToAppleMusic: vi.fn(async () => [
    {
      match: {
        albumName: "The Black Album",
        artistName: "JAY-Z",
        id: "apple-track-1",
        name: "Encore",
      },
      query: "Jay-Z Encore",
      setlistSong: {
        artistName: "Jay-Z",
        name: "Encore",
        position: 1,
      },
      status: "matched",
    },
  ]),
}));

describe("POST /api/apple-music/match", () => {
  it("returns 400 for invalid request bodies", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/apple-music/match", {
        body: JSON.stringify({ songs: "not songs" }),
        method: "POST",
      }),
    );

    await expect(response.json()).resolves.toEqual({ error: "Invalid setlist songs." });
    expect(response.status).toBe(400);
  });

  it("returns Apple Music matches", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/apple-music/match", {
        body: JSON.stringify({
          songs: [{ artistName: "Jay-Z", name: "Encore", position: 1 }],
        }),
        method: "POST",
      }),
    );

    await expect(response.json()).resolves.toEqual({
      matches: [
        {
          match: {
            albumName: "The Black Album",
            artistName: "JAY-Z",
            id: "apple-track-1",
            name: "Encore",
          },
          query: "Jay-Z Encore",
          setlistSong: {
            artistName: "Jay-Z",
            name: "Encore",
            position: 1,
          },
          status: "matched",
        },
      ],
    });
    expect(response.status).toBe(200);
  });
});
