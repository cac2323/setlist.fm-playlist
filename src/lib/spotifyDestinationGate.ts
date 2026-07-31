import { NextResponse } from "next/server";

import { isSpotifyDestinationEnabled } from "@/lib/playlistDestination";

/** Soft-disable Spotify HTTP endpoints while the destination is hidden in the UI. */
export function spotifyDestinationDisabledResponse() {
  if (isSpotifyDestinationEnabled) {
    return null;
  }

  return NextResponse.json(
    { error: "Spotify is not available yet." },
    { status: 503 },
  );
}
