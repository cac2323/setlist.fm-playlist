import { NextRequest, NextResponse } from "next/server";

import { apiDebug } from "@/lib/debug";
import {
  buildSpotifyAuthorizeUrl,
  createCodeChallenge,
  getSpotifyAuthConfig,
  SPOTIFY_COOKIE,
} from "@/lib/spotifyAuth";
import { spotifyDestinationDisabledResponse } from "@/lib/spotifyDestinationGate";

/**
 * Second hop after /login: cookies are already set on this origin, then we
 * send the browser to Spotify.
 */
export async function GET(request: NextRequest) {
  const disabled = spotifyDestinationDisabledResponse();
  if (disabled) {
    return disabled;
  }

  const requestContext = {
    method: "GET",
    url: "/api/spotify/auth/authorize",
  };

  const config = getSpotifyAuthConfig();

  if (!config) {
    apiDebug("Spotify OAuth authorize missing credentials", requestContext);
    return NextResponse.json(
      { error: "Spotify credentials are not configured." },
      { status: 503 },
    );
  }

  const state = request.cookies.get(SPOTIFY_COOKIE.oauthState)?.value;
  const verifier = request.cookies.get(SPOTIFY_COOKIE.oauthVerifier)?.value;
  const redirectOrigin = new URL(config.redirectUri).origin;

  if (!state || !verifier) {
    apiDebug("Spotify OAuth authorize missing handshake cookies", {
      ...requestContext,
      hasState: Boolean(state),
      hasVerifier: Boolean(verifier),
    });
    return NextResponse.redirect(new URL("/api/spotify/auth/login", redirectOrigin));
  }

  const authorizeUrl = buildSpotifyAuthorizeUrl({
    challenge: createCodeChallenge(verifier),
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    state,
  });

  return NextResponse.redirect(authorizeUrl.toString());
}
