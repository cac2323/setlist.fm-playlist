import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  searchAppleMusicCatalog: vi.fn(),
}));

vi.mock("@/lib/appleMusic", () => ({
  AppleMusicApiError: class AppleMusicApiError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "AppleMusicApiError";
    }
  },
  searchAppleMusicCatalog: mocks.searchAppleMusicCatalog,
}));

import { POST } from "./route";

describe("POST /api/apple-music/search", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 for an empty query", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/apple-music/search", {
        body: JSON.stringify({ query: "   " }),
        method: "POST",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid search query." });
  });

  it("returns catalog tracks for a valid query", async () => {
    mocks.searchAppleMusicCatalog.mockResolvedValue([
      {
        albumName: "The Black Album",
        artistName: "JAY-Z",
        id: "apple-track-1",
        name: "Encore",
      },
    ]);

    const response = await POST(
      new NextRequest("http://localhost/api/apple-music/search", {
        body: JSON.stringify({ query: "Jay-Z Encore" }),
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.searchAppleMusicCatalog).toHaveBeenCalledWith("Jay-Z Encore");
    await expect(response.json()).resolves.toEqual({
      tracks: [
        {
          albumName: "The Black Album",
          artistName: "JAY-Z",
          id: "apple-track-1",
          name: "Encore",
        },
      ],
    });
  });
});
