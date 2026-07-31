import { NextResponse } from "next/server";

import { clearSpotifyAuthCookies } from "@/lib/spotifyAuth";
import { spotifyDestinationDisabledResponse } from "@/lib/spotifyDestinationGate";

export async function POST() {
  const disabled = spotifyDestinationDisabledResponse();
  if (disabled) {
    return disabled;
  }

  const response = NextResponse.json({ connected: false });
  return clearSpotifyAuthCookies(response);
}
