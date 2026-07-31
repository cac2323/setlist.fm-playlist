import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { AppleMusicApiError, matchSetlistSongsToAppleMusic } from "@/lib/appleMusic";
import { enforceApiRateLimit } from "@/lib/rateLimit";

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
  const rateLimited = enforceApiRateLimit(request, "catalogMatch");
  if (rateLimited) {
    return rateLimited;
  }

  const requestBody: unknown = await request.json();
  const parsedRequest = matchRequestSchema.safeParse(requestBody);

  if (!parsedRequest.success) {
    return NextResponse.json({ error: "Invalid setlist songs." }, { status: 400 });
  }

  try {
    const matches = await matchSetlistSongsToAppleMusic(parsedRequest.data.songs);

    return NextResponse.json({ matches });
  } catch (error) {
    if (error instanceof AppleMusicApiError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    return NextResponse.json({ error: "Unable to match Apple Music tracks." }, { status: 500 });
  }
}
