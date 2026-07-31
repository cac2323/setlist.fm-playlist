import { z } from "zod";

const PENDING_SPOTIFY_MATCH_KEY = "setlist-playlist:pending-spotify-match";

const pendingSpotifyMatchSchema = z.object({
  setlistId: z.string().min(1),
  setlistUrl: z.string().min(1),
});

export type PendingSpotifyMatch = z.infer<typeof pendingSpotifyMatchSchema>;

export function savePendingSpotifyMatch(intent: PendingSpotifyMatch) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(PENDING_SPOTIFY_MATCH_KEY, JSON.stringify(intent));
}

export function readPendingSpotifyMatch(): PendingSpotifyMatch | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.sessionStorage.getItem(PENDING_SPOTIFY_MATCH_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = pendingSpotifyMatchSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function clearPendingSpotifyMatch() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(PENDING_SPOTIFY_MATCH_KEY);
}
