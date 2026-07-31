import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiDebug } from "@/lib/debug";
import { enforceApiRateLimit } from "@/lib/rateLimit";
import { SpotifyApiError, matchSetlistSongsToSpotify } from "@/lib/spotify";
import {
  applySpotifyTokenCookies,
  getSpotifyAccessTokenFromCookies,
} from "@/lib/spotifyAuth";
import { spotifyDestinationDisabledResponse } from "@/lib/spotifyDestinationGate";

const matchRequestSchema = z.object({
  songs: z.array(
    z.object({
      artistName: z.string(),
      coverArtistName: z.string().optional(),
      info: z.string().optional(),
      name: z.string(),
      position: z.number(),
    }),
  ),
});

export async function POST(request: NextRequest) {
  const disabled = spotifyDestinationDisabledResponse();
  if (disabled) {
    return disabled;
  }

  const rateLimited = enforceApiRateLimit(request, "catalogMatch");
  if (rateLimited) {
    return rateLimited;
  }

  const requestContext = {
    method: "POST",
    url: "/api/spotify/match",
  };
  const requestBody: unknown = await request.json();
  const parsedRequest = matchRequestSchema.safeParse(requestBody);

  if (!parsedRequest.success) {
    return NextResponse.json({ error: "Invalid setlist songs." }, { status: 400 });
  }

  try {
    // Prefer the user OAuth token so Spotify can resolve their market/country.
    // Fall back to client-credentials + market inside the matcher when absent.
    const tokenResult = await getSpotifyAccessTokenFromCookies();
    const matches = await matchSetlistSongsToSpotify(parsedRequest.data.songs, {
      accessToken: tokenResult?.accessToken,
    });

    const response = NextResponse.json({ matches });

    if (tokenResult?.refreshed) {
      applySpotifyTokenCookies(response, tokenResult.tokens);
    }

    return response;
  } catch (error) {
    apiDebug("Spotify match request failed", {
      ...requestContext,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
      errorName: error instanceof Error ? error.name : "Unknown",
      songCount: parsedRequest.data.songs.length,
    });

    if (error instanceof SpotifyApiError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    return NextResponse.json({ error: "Unable to match Spotify tracks." }, { status: 500 });
  }
}
