import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import {
  setRateLimitPolicyForTests,
} from "@/lib/rateLimit";

import { GET } from "./route";

vi.mock("@/lib/setlistfm", () => ({
  fetchSetlistById: vi.fn(async () => ({
    artistName: "Jay-Z",
    id: "3b497c60",
    songs: [{ artistName: "Jay-Z", name: "Encore", position: 1 }],
  })),
  SetlistFmApiError: class SetlistFmApiError extends Error {
    constructor(
      message: string,
      readonly status?: number,
    ) {
      super(message);
      this.name = "SetlistFmApiError";
    }
  },
}));

describe("GET /api/setlist", () => {
  it("returns a 400 when id is missing", async () => {
    const response = await GET(new NextRequest("http://localhost/api/setlist"));

    await expect(response.json()).resolves.toEqual({ error: "Missing setlist ID." });
    expect(response.status).toBe(400);
  });

  it("returns a normalized setlist", async () => {
    const response = await GET(new NextRequest("http://localhost/api/setlist?id=3b497c60"));

    await expect(response.json()).resolves.toEqual({
      setlist: {
        artistName: "Jay-Z",
        id: "3b497c60",
        songs: [{ artistName: "Jay-Z", name: "Encore", position: 1 }],
      },
    });
    expect(response.status).toBe(200);
  });

  it("returns 429 when the client exceeds the setlist quota", async () => {
    setRateLimitPolicyForTests("setlist", { limit: 1, windowMs: 60_000 });

    const headers = { "x-forwarded-for": "203.0.113.99" };
    const first = await GET(
      new NextRequest("http://localhost/api/setlist?id=3b497c60", { headers }),
    );
    const second = await GET(
      new NextRequest("http://localhost/api/setlist?id=3b497c60", { headers }),
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    await expect(second.json()).resolves.toEqual({
      error: "Too many requests. Please try again shortly.",
    });
    expect(second.headers.get("Retry-After")).toBeTruthy();
  });
});
