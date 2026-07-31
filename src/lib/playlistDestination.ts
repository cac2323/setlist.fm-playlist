export const PLAYLIST_DESTINATIONS = ["apple-music", "spotify"] as const;

export type PlaylistDestination = (typeof PLAYLIST_DESTINATIONS)[number];

/**
 * Spotify Web API development mode may require Premium for the app owner.
 * Enabled for local testing of OAuth, matching, and playlist creation.
 */
export const isSpotifyDestinationEnabled = true;

export function getDestinationLabel(destination: PlaylistDestination) {
  return destination === "spotify" ? "Spotify" : "Apple Music";
}

export function isPlaylistDestination(value: unknown): value is PlaylistDestination {
  return value === "apple-music" || value === "spotify";
}
