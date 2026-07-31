import type { SetlistSongMatch } from "./appleMusic";
import { buildAppleMusicPlaylistTracks } from "./appleMusicPlaylist";

type BuildPlaylistTracksOptions = {
  includedReviewKeys?: ReadonlySet<string>;
};

export function toSpotifyTrackUri(trackId: string) {
  if (trackId.startsWith("spotify:track:")) {
    return trackId;
  }

  return `spotify:track:${trackId}`;
}

export function buildSpotifyPlaylistTrackUris(
  matches: SetlistSongMatch[],
  options: BuildPlaylistTracksOptions = {},
) {
  const uris = buildAppleMusicPlaylistTracks(matches, options).map((track) =>
    toSpotifyTrackUri(track.id),
  );

  return uris;
}
