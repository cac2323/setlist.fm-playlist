import { describe, expect, it } from "vitest";

import {
  buildSpotifyAuthorizeUrl,
  createOAuthState,
  createPkcePair,
  SPOTIFY_SCOPES,
} from "./spotifyAuth";

describe("spotifyAuth helpers", () => {
  it("builds a PKCE authorize URL with required params", () => {
    const { challenge, verifier } = createPkcePair();
    const state = createOAuthState();

    expect(verifier.length).toBeGreaterThan(20);
    expect(challenge.length).toBeGreaterThan(20);
    expect(state.length).toBeGreaterThan(10);

    const url = buildSpotifyAuthorizeUrl({
      challenge,
      clientId: "client-123",
      redirectUri: "http://127.0.0.1:3000/api/spotify/auth/callback",
      state,
    });

    expect(url.origin + url.pathname).toBe("https://accounts.spotify.com/authorize");
    expect(url.searchParams.get("client_id")).toBe("client-123");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://127.0.0.1:3000/api/spotify/auth/callback",
    );
    expect(url.searchParams.get("scope")).toBe(SPOTIFY_SCOPES);
    expect(url.searchParams.get("state")).toBe(state);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(challenge);
  });
});
