import { afterEach, describe, expect, it, vi } from "vitest";

const debugMocks = vi.hoisted(() => ({
  apiDebug: vi.fn(),
}));

vi.mock("./debug", () => debugMocks);

vi.mock("./spotifyAuth", () => ({
  getSpotifyAuthConfig: vi.fn(() => ({
    clientId: "client-id",
    clientSecret: "client-secret",
    redirectUri: "http://127.0.0.1:3000/api/spotify/auth/callback",
  })),
}));

import { REDACTED_LOG_VALUE } from "./redactForLog";
import {
  getSpotifyClientCredentialsToken,
  resetSpotifyClientCredentialsTokenCache,
} from "./spotifyToken";

describe("spotifyToken logging", () => {
  afterEach(() => {
    resetSpotifyClientCredentialsTokenCache();
    debugMocks.apiDebug.mockReset();
    vi.restoreAllMocks();
  });

  it("redacts access_token when logging invalid client-credentials responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "should-not-appear-in-logs",
          expires_in: "nope",
          token_type: "Bearer",
        }),
        { status: 200 },
      ),
    );

    await expect(getSpotifyClientCredentialsToken()).rejects.toThrow(
      "Spotify returned an invalid token response.",
    );

    expect(debugMocks.apiDebug).toHaveBeenCalledWith(
      "Spotify client credentials response validation failed",
      expect.objectContaining({
        responseBody: expect.objectContaining({
          access_token: REDACTED_LOG_VALUE,
          token_type: "Bearer",
        }),
      }),
    );

    const logged = JSON.stringify(debugMocks.apiDebug.mock.calls);
    expect(logged).not.toContain("should-not-appear-in-logs");
  });
});
