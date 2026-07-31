import { NextRequest, NextResponse } from "next/server";

import { getAppleMusicDeveloperToken } from "@/lib/appleMusicToken";
import { apiDebug } from "@/lib/debug";
import { enforceApiRateLimit } from "@/lib/rateLimit";

export async function GET(request: NextRequest) {
  const rateLimited = enforceApiRateLimit(request, "appleToken");
  if (rateLimited) {
    return rateLimited;
  }

  const requestContext = {
    method: "GET",
    url: "/api/apple-music/token",
  };

  try {
    const developerToken = await getAppleMusicDeveloperToken();

    if (!developerToken) {
      apiDebug("Apple Music developer token configuration missing", requestContext);

      return NextResponse.json(
        { error: "Apple Music credentials are not configured." },
        {
          headers: { "Cache-Control": "no-store" },
          status: 503,
        },
      );
    }

    return NextResponse.json(
      { developerToken },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    apiDebug("Apple Music developer token request failed", {
      ...requestContext,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
      errorName: error instanceof Error ? error.name : "Unknown",
    });

    return NextResponse.json(
      { error: "Unable to configure Apple Music authorization." },
      {
        headers: { "Cache-Control": "no-store" },
        status: 500,
      },
    );
  }
}
