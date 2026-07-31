import { NextResponse } from "next/server";

import { apiDebug } from "@/lib/debug";
import {
  applySpotifyTokenCookies,
  fetchSpotifyProfile,
  getSpotifyAccessTokenFromCookies,
  getSpotifyAuthConfig,
  SpotifyAuthError,
} from "@/lib/spotifyAuth";
import { spotifyDestinationDisabledResponse } from "@/lib/spotifyDestinationGate";

export async function GET() {
  const disabled = spotifyDestinationDisabledResponse();
  if (disabled) {
    return disabled;
  }

  const requestContext = {
    method: "GET",
    url: "/api/spotify/auth/status",
  };

  if (!getSpotifyAuthConfig()) {
    return NextResponse.json(
      { connected: false, error: "Spotify credentials are not configured." },
      {
        headers: { "Cache-Control": "no-store" },
        status: 503,
      },
    );
  }

  try {
    const tokenResult = await getSpotifyAccessTokenFromCookies();

    if (!tokenResult) {
      return NextResponse.json(
        { connected: false },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const profile = await fetchSpotifyProfile(tokenResult.accessToken);
    const response = NextResponse.json(
      {
        connected: true,
        displayName: profile.displayName,
      },
      { headers: { "Cache-Control": "no-store" } },
    );

    if (tokenResult.refreshed) {
      applySpotifyTokenCookies(response, tokenResult.tokens);
    }

    return response;
  } catch (error) {
    apiDebug("Spotify authorization status failed", {
      ...requestContext,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
      errorName: error instanceof Error ? error.name : "Unknown",
    });

    if (error instanceof SpotifyAuthError) {
      return NextResponse.json(
        { connected: false, error: error.message },
        {
          headers: { "Cache-Control": "no-store" },
          status: 401,
        },
      );
    }

    return NextResponse.json(
      { connected: false, error: "Unable to check Spotify authorization." },
      {
        headers: { "Cache-Control": "no-store" },
        status: 500,
      },
    );
  }
}
