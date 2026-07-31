import type { SelectedAppleMusicTrack, SetlistSongMatch } from "./appleMusic";
import {
  getSelectedMatchReviewKey,
  getSetlistSongMatchKey,
} from "./appleMusicShared";
import type { NormalizedSetlist } from "./setlistfm";

export type AppleMusicPlaylistTrack = {
  id: string;
  type: "songs";
};

export { getSelectedMatchReviewKey, getSetlistSongMatchKey } from "./appleMusicShared";

type BuildPlaylistTracksOptions = {
  includedReviewKeys?: ReadonlySet<string>;
};

function getSelectedMatchStatus(
  songMatch: SetlistSongMatch,
  selectedMatch: SelectedAppleMusicTrack,
): "matched" | "needs_review" {
  return selectedMatch.status ?? (songMatch.status === "needs_review" ? "needs_review" : "matched");
}

export function buildAppleMusicPlaylistTracks(
  matches: SetlistSongMatch[],
  options: BuildPlaylistTracksOptions = {},
) {
  let lastTrackId: string | null = null;
  const tracks: AppleMusicPlaylistTrack[] = [];
  const includedReviewKeys = options.includedReviewKeys ?? new Set<string>();

  for (const songMatch of matches) {
    if (songMatch.status === "unmatched") {
      continue;
    }

    const selectedTracks =
      songMatch.selectedMatches?.length > 0
        ? songMatch.selectedMatches
        : songMatch.match
          ? [
              {
                confidence: songMatch.confidence,
                match: songMatch.match,
                query: songMatch.query,
                reasons: songMatch.reasons,
                segmentTitle: songMatch.setlistSong.name,
                status:
                  songMatch.status === "needs_review"
                    ? ("needs_review" as const)
                    : ("matched" as const),
              },
            ]
          : [];

    for (const selectedMatch of selectedTracks) {
      const selectedStatus = getSelectedMatchStatus(songMatch, selectedMatch);

      if (selectedStatus === "needs_review") {
        const segmentKey = getSelectedMatchReviewKey(songMatch, selectedMatch);
        const songKey = getSetlistSongMatchKey(songMatch);
        if (!includedReviewKeys.has(segmentKey) && !includedReviewKeys.has(songKey)) {
          continue;
        }
      }

      // Only collapse consecutive repeats so reprises later in the set are kept.
      if (selectedMatch.match.id === lastTrackId) {
        continue;
      }

      lastTrackId = selectedMatch.match.id;
      tracks.push({
        id: selectedMatch.match.id,
        type: "songs",
      });
    }
  }

  return tracks;
}

export function buildDefaultAppleMusicPlaylistName(setlist: NormalizedSetlist) {
  const location = setlist.venue?.name ?? "Setlist";
  const date = setlist.eventDate ? ` · ${setlist.eventDate}` : "";

  return `${setlist.artistName} · ${location}${date}`.slice(0, 100);
}
