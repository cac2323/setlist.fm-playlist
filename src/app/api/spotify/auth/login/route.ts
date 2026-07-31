import { NextRequest, NextResponse } from "next/server";

import { apiDebug } from "@/lib/debug";
import {
  createOAuthState,
  createPkcePair,
  getSpotifyAuthConfig,
  SPOTIFY_COOKIE,
  spotifyOAuthCookieOptions,
} from "@/lib/spotifyAuth";
import { spotifyDestinationDisabledResponse } from "@/lib/spotifyDestinationGate";

function requestHost(request: NextRequest) {
  return request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
}

/**
 * Start Spotify PKCE: set state/verifier cookies on a same-origin redirect.
 * Browsers often drop Set-Cookie when the response immediately redirects cross-site
 * to accounts.spotify.com, which caused "authorization could not be verified".
 */
export async function GET(request: NextRequest) {
  const disabled = spotifyDestinationDisabledResponse();
  if (disabled) {
    return disabled;
  }

  const requestContext = {
    method: "GET",
    url: "/api/spotify/auth/login",
  };

  const config = getSpotifyAuthConfig();

  if (!config) {
    apiDebug("Spotify OAuth login missing credentials", requestContext);
    return NextResponse.json(
      { error: "Spotify credentials are not configured." },
      { status: 503 },
    );
  }

  // Cookies are host-only. Spotify always returns to SPOTIFY_REDIRECT_URI's host
  // (127.0.0.1). If the user started on localhost, bounce there first.
  const redirectUrl = new URL(config.redirectUri);
  const host = requestHost(request);
  if (host !== redirectUrl.host) {
    const canonical = new URL(
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
      redirectUrl.origin,
    );
    apiDebug("Spotify OAuth login canonicalizing host", {
      ...requestContext,
      from: host,
      to: redirectUrl.host,
    });
    return NextResponse.redirect(canonical);
  }

  const { verifier } = createPkcePair();
  const state = createOAuthState();
  const authorizeUrl = new URL("/api/spotify/auth/authorize", redirectUrl.origin);
  const response = NextResponse.redirect(authorizeUrl);
  const cookieOptions = spotifyOAuthCookieOptions();

  response.cookies.set(SPOTIFY_COOKIE.oauthState, state, cookieOptions);
  response.cookies.set(SPOTIFY_COOKIE.oauthVerifier, verifier, cookieOptions);

  return response;
}
