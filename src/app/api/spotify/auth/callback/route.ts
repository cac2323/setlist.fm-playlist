import { NextRequest, NextResponse } from "next/server";

import { apiDebug } from "@/lib/debug";
import {
  applySpotifyTokenCookies,
  clearSpotifyOAuthCookies,
  exchangeSpotifyAuthorizationCode,
  getSpotifyAuthConfig,
  SPOTIFY_COOKIE,
  SpotifyAuthError,
} from "@/lib/spotifyAuth";
import { spotifyDestinationDisabledResponse } from "@/lib/spotifyDestinationGate";

function redirectWithAuthResult(
  request: NextRequest,
  result: "success" | "error",
  message?: string,
) {
  // Always return to the redirect URI origin so token cookies (host-only) stay
  // visible. request.url can be localhost even when Spotify called 127.0.0.1.
  const config = getSpotifyAuthConfig();
  const origin = config
    ? new URL(config.redirectUri).origin
    : new URL(request.url).origin;
  const url = new URL("/", origin);
  url.searchParams.set("spotify_auth", result);
  if (message) {
    url.searchParams.set("spotify_auth_error", message);
  }
  url.hash = "setlist-workflow";
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const disabled = spotifyDestinationDisabledResponse();
  if (disabled) {
    return disabled;
  }

  const requestContext = {
    method: "GET",
    url: "/api/spotify/auth/callback",
  };

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const oauthError = request.nextUrl.searchParams.get("error");
  const expectedState = request.cookies.get(SPOTIFY_COOKIE.oauthState)?.value;
  const verifier = request.cookies.get(SPOTIFY_COOKIE.oauthVerifier)?.value;

  if (oauthError) {
    apiDebug("Spotify OAuth denied", { ...requestContext, oauthError });
    const response = redirectWithAuthResult(request, "error", "Spotify authorization was denied.");
    return clearSpotifyOAuthCookies(response);
  }

  if (!code || !state || !expectedState || state !== expectedState || !verifier) {
    apiDebug("Spotify OAuth callback invalid state or code", {
      ...requestContext,
      hasCode: Boolean(code),
      hasExpectedState: Boolean(expectedState),
      hasState: Boolean(state),
      hasVerifier: Boolean(verifier),
      host: request.nextUrl.host,
      stateMatched: Boolean(state && expectedState && state === expectedState),
    });
    const response = redirectWithAuthResult(
      request,
      "error",
      "Spotify authorization could not be verified.",
    );
    return clearSpotifyOAuthCookies(response);
  }

  try {
    const tokens = await exchangeSpotifyAuthorizationCode({ code, verifier });
    const response = redirectWithAuthResult(request, "success");
    clearSpotifyOAuthCookies(response);
    applySpotifyTokenCookies(response, tokens);
    return response;
  } catch (error) {
    apiDebug("Spotify OAuth token exchange failed", {
      ...requestContext,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
      errorName: error instanceof Error ? error.name : "Unknown",
    });
    const message =
      error instanceof SpotifyAuthError
        ? error.message
        : "Unable to complete Spotify authorization.";
    const response = redirectWithAuthResult(request, "error", message);
    return clearSpotifyOAuthCookies(response);
  }
}
