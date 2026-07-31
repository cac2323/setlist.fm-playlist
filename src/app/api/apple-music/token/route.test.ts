import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const tokenMocks = vi.hoisted(() => ({
  getAppleMusicDeveloperToken: vi.fn(),
}));

vi.mock("@/lib/appleMusicToken", () => tokenMocks);

import { GET } from "./route";

function tokenRequest() {
  return new NextRequest("http://localhost/api/apple-music/token");
}

describe("GET /api/apple-music/token", () => {
  afterEach(() => {
    tokenMocks.getAppleMusicDeveloperToken.mockReset();
  });

  it("returns a non-cacheable developer token", async () => {
    tokenMocks.getAppleMusicDeveloperToken.mockResolvedValue("developer-token");

    const response = await GET(tokenRequest());

    await expect(response.json()).resolves.toEqual({
      developerToken: "developer-token",
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.status).toBe(200);
  });

  it("returns 503 when Apple Music credentials are missing", async () => {
    tokenMocks.getAppleMusicDeveloperToken.mockResolvedValue(null);

    const response = await GET(tokenRequest());

    await expect(response.json()).resolves.toEqual({
      error: "Apple Music credentials are not configured.",
    });
    expect(response.status).toBe(503);
  });

  it("returns 500 when token generation fails", async () => {
    tokenMocks.getAppleMusicDeveloperToken.mockRejectedValue(new Error("Key read failed"));

    const response = await GET(tokenRequest());

    await expect(response.json()).resolves.toEqual({
      error: "Unable to configure Apple Music authorization.",
    });
    expect(response.status).toBe(500);
  });
});
