import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiDebug } from "@/lib/debug";
import { enforceApiRateLimit } from "@/lib/rateLimit";
import { SpotifyApiError, searchSpotifyCatalog } from "@/lib/spotify";
import {
  applySpotifyTokenCookies,
  getSpotifyAccessTokenFromCookies,
} from "@/lib/spotifyAuth";
import { spotifyDestinationDisabledResponse } from "@/lib/spotifyDestinationGate";

const searchRequestSchema = z.object({
  query: z.string().trim().min(1),
});

export async function POST(request: NextRequest) {
  const disabled = spotifyDestinationDisabledResponse();
  if (disabled) {
    return disabled;
  }

  const rateLimited = enforceApiRateLimit(request, "catalogSearch");
  if (rateLimited) {
    return rateLimited;
  }

  const requestContext = {
    method: "POST",
    url: "/api/spotify/search",
  };
  const requestBody: unknown = await request.json().catch(() => null);
  const parsedRequest = searchRequestSchema.safeParse(requestBody);

  if (!parsedRequest.success) {
    return NextResponse.json({ error: "Invalid search query." }, { status: 400 });
  }

  try {
    const tokenResult = await getSpotifyAccessTokenFromCookies();
    const tracks = await searchSpotifyCatalog(parsedRequest.data.query, {
      accessToken: tokenResult?.accessToken,
    });

    const response = NextResponse.json({ tracks });

    if (tokenResult?.refreshed) {
      applySpotifyTokenCookies(response, tokenResult.tokens);
    }

    return response;
  } catch (error) {
    apiDebug("Spotify search request failed", {
      ...requestContext,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
      errorName: error instanceof Error ? error.name : "Unknown",
      queryLength: parsedRequest.data.query.length,
    });

    if (error instanceof SpotifyApiError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    return NextResponse.json({ error: "Unable to search Spotify." }, { status: 500 });
  }
}
