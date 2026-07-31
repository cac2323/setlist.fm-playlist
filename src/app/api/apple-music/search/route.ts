import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { AppleMusicApiError, searchAppleMusicCatalog } from "@/lib/appleMusic";
import { apiDebug } from "@/lib/debug";
import { enforceApiRateLimit } from "@/lib/rateLimit";

const searchRequestSchema = z.object({
  query: z.string().trim().min(1),
});

export async function POST(request: NextRequest) {
  const rateLimited = enforceApiRateLimit(request, "catalogSearch");
  if (rateLimited) {
    return rateLimited;
  }

  const requestContext = {
    method: "POST",
    url: "/api/apple-music/search",
  };
  const requestBody: unknown = await request.json().catch(() => null);
  const parsedRequest = searchRequestSchema.safeParse(requestBody);

  if (!parsedRequest.success) {
    return NextResponse.json({ error: "Invalid search query." }, { status: 400 });
  }

  try {
    const tracks = await searchAppleMusicCatalog(parsedRequest.data.query);
    return NextResponse.json({ tracks });
  } catch (error) {
    apiDebug("Apple Music search request failed", {
      ...requestContext,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
      errorName: error instanceof Error ? error.name : "Unknown",
      queryLength: parsedRequest.data.query.length,
    });

    if (error instanceof AppleMusicApiError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    return NextResponse.json({ error: "Unable to search Apple Music." }, { status: 500 });
  }
}
