import type { SelectedAppleMusicTrack, SetlistSongMatch } from "./appleMusic";
import { getSetlistSongMatchKey } from "./appleMusicShared";

export type MatchStatusFilter = "all" | "matched" | "needs_review" | "unmatched";

export type MatchStatusCounts = {
  all: number;
  matched: number;
  needs_review: number;
  unmatched: number;
};

function selectedMatchNeedsReview(
  songMatch: SetlistSongMatch,
  selectedMatch: SelectedAppleMusicTrack,
) {
  return (
    selectedMatch.status === "needs_review" ||
    (songMatch.status === "needs_review" && !selectedMatch.status)
  );
}

export function classifySongMatchStatus(
  songMatch: SetlistSongMatch,
): Exclude<MatchStatusFilter, "all"> {
  if (songMatch.status === "unmatched") {
    return "unmatched";
  }

  const selectedMatches = songMatch.selectedMatches ?? [];
  const hasReviewSegments =
    songMatch.status === "needs_review" ||
    selectedMatches.some((selectedMatch) =>
      selectedMatchNeedsReview(songMatch, selectedMatch),
    );

  if (hasReviewSegments) {
    return "needs_review";
  }

  return "matched";
}

export function countMatchStatuses(matches: readonly SetlistSongMatch[]): MatchStatusCounts {
  return matches.reduce<MatchStatusCounts>(
    (counts, songMatch) => {
      const status = classifySongMatchStatus(songMatch);
      counts[status] += 1;
      counts.all += 1;
      return counts;
    },
    { all: 0, matched: 0, needs_review: 0, unmatched: 0 },
  );
}

export function getDefaultMatchStatusFilter(
  counts: MatchStatusCounts,
): MatchStatusFilter {
  if (counts.needs_review > 0) {
    return "needs_review";
  }
  if (counts.unmatched > 0) {
    return "unmatched";
  }
  return "all";
}

export function filterMatchesByStatus(
  matches: readonly SetlistSongMatch[],
  filter: MatchStatusFilter,
  retainKeys: ReadonlySet<string> = new Set(),
): SetlistSongMatch[] {
  if (filter === "all") {
    return [...matches];
  }

  const primary = matches.filter(
    (songMatch) => classifySongMatchStatus(songMatch) === filter,
  );

  if (retainKeys.size === 0) {
    return primary;
  }

  const primaryKeys = new Set(primary.map(getSetlistSongMatchKey));
  const retained = matches.filter((songMatch) => {
    const key = getSetlistSongMatchKey(songMatch);
    return (
      retainKeys.has(key) &&
      !primaryKeys.has(key) &&
      classifySongMatchStatus(songMatch) === "matched"
    );
  });

  return [...primary, ...retained].sort(
    (left, right) => left.setlistSong.position - right.setlistSong.position,
  );
}

export function shouldKeepStatusFilterTab(
  filter: MatchStatusFilter,
  counts: MatchStatusCounts,
  retainedFilter: MatchStatusFilter | null,
  retainedKeyCount: number,
) {
  if (filter === "all") {
    return true;
  }
  if (counts[filter] > 0) {
    return true;
  }
  return retainedFilter === filter && retainedKeyCount > 0;
}

export function resolveActiveStatusFilter(
  activeFilter: MatchStatusFilter,
  counts: MatchStatusCounts,
  retainedFilter: MatchStatusFilter | null,
  retainedKeyCount: number,
): MatchStatusFilter {
  if (activeFilter === "all") {
    return "all";
  }
  if (counts[activeFilter] > 0) {
    return activeFilter;
  }
  if (retainedFilter === activeFilter && retainedKeyCount > 0) {
    return activeFilter;
  }
  return getDefaultMatchStatusFilter(counts);
}

export function getEmptyMatchFilterMessage(filter: MatchStatusFilter): string {
  switch (filter) {
    case "matched":
      return "No matched songs.";
    case "needs_review":
      return "No songs need review.";
    case "unmatched":
      return "No unmatched songs.";
    default:
      return "No songs to show.";
  }
}
