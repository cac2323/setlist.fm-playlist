import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiDebug } from "@/lib/debug";
import { enforceApiRateLimit } from "@/lib/rateLimit";
import { SpotifyApiError } from "@/lib/spotify";
import {
  applySpotifyTokenCookies,
  getSpotifyAccessTokenFromCookies,
  SpotifyAuthError,
} from "@/lib/spotifyAuth";
import { spotifyDestinationDisabledResponse } from "@/lib/spotifyDestinationGate";
import { createSpotifyPlaylist } from "@/lib/spotifyPlaylist";

const createPlaylistRequestSchema = z.object({
  description: z.string().trim().min(1).max(300),
  name: z.string().trim().min(1).max(100),
  uris: z.array(z.string().regex(/^spotify:track:[A-Za-z0-9]+$/)).min(1).max(500),
});

export async function POST(request: NextRequest) {
  const disabled = spotifyDestinationDisabledResponse();
  if (disabled) {
    return disabled;
  }

  const rateLimited = enforceApiRateLimit(request, "playlistCreate");
  if (rateLimited) {
    return rateLimited;
  }

  const requestContext = {
    method: "POST",
    url: "/api/spotify/playlist",
  };
  const requestBody: unknown = await request.json().catch(() => null);
  const parsedRequest = createPlaylistRequestSchema.safeParse(requestBody);

  if (!parsedRequest.success) {
    return NextResponse.json({ error: "Invalid playlist request." }, { status: 400 });
  }

  try {
    const tokenResult = await getSpotifyAccessTokenFromCookies();

    if (!tokenResult) {
      return NextResponse.json(
        { error: "Connect Spotify before creating a playlist." },
        { status: 401 },
      );
    }

    const playlist = await createSpotifyPlaylist({
      accessToken: tokenResult.accessToken,
      description: parsedRequest.data.description,
      name: parsedRequest.data.name,
      uris: parsedRequest.data.uris,
    });

    const response = NextResponse.json(playlist);

    if (tokenResult.refreshed) {
      applySpotifyTokenCookies(response, tokenResult.tokens);
    }

    return response;
  } catch (error) {
    apiDebug("Spotify playlist creation failed", {
      ...requestContext,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
      errorName: error instanceof Error ? error.name : "Unknown",
      requestBody,
      trackCount:
        parsedRequest.success && Array.isArray(parsedRequest.data.uris)
          ? parsedRequest.data.uris.length
          : undefined,
    });

    if (error instanceof SpotifyAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof SpotifyApiError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    return NextResponse.json(
      { error: "Unable to create the Spotify playlist." },
      { status: 500 },
    );
  }
}
