import type {
  AppleMusicTrackMatch,
  SelectedAppleMusicTrack,
  SetlistSongMatch,
} from "./appleMusic";
import type { ScoredAppleMusicTrackMatch } from "./appleMusicMatching";

const MAX_ALTERNATIVES = 3;

export type ApplySelectedTrackOptions = {
  reason?: string;
  segmentTitle?: string;
  track: AppleMusicTrackMatch | ScoredAppleMusicTrackMatch;
};

export type SelectAlternateTrackOptions = {
  alternativeId: string;
  segmentTitle?: string;
};

function toScoredTrack(
  track: AppleMusicTrackMatch | ScoredAppleMusicTrackMatch,
  reason: string,
): ScoredAppleMusicTrackMatch {
  const confidence = "confidence" in track && typeof track.confidence === "number" ? track.confidence : 1;
  const existingReasons = "reasons" in track && Array.isArray(track.reasons) ? track.reasons : [];

  return {
    albumName: track.albumName,
    artistName: track.artistName,
    confidence,
    id: track.id,
    name: track.name,
    reasons: existingReasons.includes(reason) ? existingReasons : [reason, ...existingReasons],
    url: track.url,
  };
}

function pushPreviousAsAlternative(
  alternatives: ScoredAppleMusicTrackMatch[],
  previous: ScoredAppleMusicTrackMatch | null | undefined,
  chosenId: string,
) {
  const next = alternatives.filter((alternative) => alternative.id !== chosenId);

  if (previous && previous.id !== chosenId && !next.some((alternative) => alternative.id === previous.id)) {
    next.unshift(previous);
  }

  return next.slice(0, MAX_ALTERNATIVES);
}

function syncSongMatchFromSelection(
  songMatch: SetlistSongMatch,
  selectedMatches: SelectedAppleMusicTrack[],
  alternatives: ScoredAppleMusicTrackMatch[],
): SetlistSongMatch {
  const primary = selectedMatches[0] ?? null;
  const allMatched =
    selectedMatches.length > 0 && selectedMatches.every((entry) => entry.status === "matched");

  return {
    ...songMatch,
    alternatives,
    confidence: primary?.confidence ?? 0,
    match: primary?.match ?? null,
    query: primary?.query ?? songMatch.query,
    reasons: primary?.reasons ?? ["Unmatched"],
    selectedMatches,
    status: primary ? (allMatched ? "matched" : "needs_review") : "unmatched",
  };
}

export function applySelectedTrack(
  songMatch: SetlistSongMatch,
  options: ApplySelectedTrackOptions,
): SetlistSongMatch {
  const reason = options.reason ?? "Selected by user";
  const scoredTrack = toScoredTrack(options.track, reason);
  const existingSelected = songMatch.selectedMatches ?? [];

  let selectedMatches: SelectedAppleMusicTrack[];
  let previous: ScoredAppleMusicTrackMatch | null = null;

  if (options.segmentTitle) {
    const targetIndex = existingSelected.findIndex(
      (entry) => entry.segmentTitle === options.segmentTitle,
    );

    if (targetIndex === -1) {
      previous = songMatch.match;
      selectedMatches = [
        ...existingSelected,
        {
          confidence: scoredTrack.confidence,
          match: scoredTrack,
          query: songMatch.query,
          reasons: scoredTrack.reasons,
          segmentTitle: options.segmentTitle,
          status: "matched",
        },
      ];
    } else {
      previous = existingSelected[targetIndex]?.match ?? null;
      selectedMatches = existingSelected.map((entry, index) =>
        index === targetIndex
          ? {
              ...entry,
              confidence: scoredTrack.confidence,
              match: scoredTrack,
              reasons: scoredTrack.reasons,
              status: "matched" as const,
            }
          : entry,
      );
    }
  } else if (existingSelected.length === 1) {
    previous = existingSelected[0]?.match ?? null;
    selectedMatches = [
      {
        ...existingSelected[0],
        confidence: scoredTrack.confidence,
        match: scoredTrack,
        reasons: scoredTrack.reasons,
        status: "matched",
      },
    ];
  } else if (existingSelected.length > 1) {
    previous = existingSelected[0]?.match ?? null;
    selectedMatches = existingSelected.map((entry, index) =>
      index === 0
        ? {
            ...entry,
            confidence: scoredTrack.confidence,
            match: scoredTrack,
            reasons: scoredTrack.reasons,
            status: "matched" as const,
          }
        : entry,
    );
  } else if (songMatch.match) {
    previous = songMatch.match;
    selectedMatches = [
      {
        confidence: scoredTrack.confidence,
        match: scoredTrack,
        query: songMatch.query,
        reasons: scoredTrack.reasons,
        segmentTitle: songMatch.setlistSong.name,
        status: "matched",
      },
    ];
  } else {
    selectedMatches = [
      {
        confidence: scoredTrack.confidence,
        match: scoredTrack,
        query: songMatch.query,
        reasons: scoredTrack.reasons,
        segmentTitle: songMatch.setlistSong.name,
        status: "matched",
      },
    ];
  }

  const alternatives = pushPreviousAsAlternative(
    songMatch.alternatives,
    previous,
    scoredTrack.id,
  );

  return syncSongMatchFromSelection(songMatch, selectedMatches, alternatives);
}

export function selectAlternateTrack(
  songMatch: SetlistSongMatch,
  options: SelectAlternateTrackOptions,
): SetlistSongMatch {
  const alternative = songMatch.alternatives.find(
    (candidate) => candidate.id === options.alternativeId,
  );

  if (!alternative) {
    return songMatch;
  }

  return applySelectedTrack(songMatch, {
    reason: "Selected by user",
    segmentTitle: options.segmentTitle,
    track: alternative,
  });
}
