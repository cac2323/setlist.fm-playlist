import { describe, expect, it } from "vitest";

import { SetlistSongMatch } from "./appleMusic";
import {
  buildAppleMusicPlaylistTracks,
  buildDefaultAppleMusicPlaylistName,
} from "./appleMusicPlaylist";

function createSongMatch(
  position: number,
  selectedTrackIds: string[],
): SetlistSongMatch {
  const selectedMatches = selectedTrackIds.map((id, index) => {
    const match = {
      artistName: "JAY-Z",
      confidence: 1,
      id,
      name: `Track ${id}`,
      reasons: ["Exact title match"],
    };

    return {
      confidence: 1,
      match,
      query: `Jay-Z Track ${id}`,
      reasons: match.reasons,
      segmentTitle: `Segment ${index + 1}`,
      status: "matched" as const,
    };
  });

  return {
    alternatives: [],
    confidence: selectedMatches.length > 0 ? 1 : 0,
    match: selectedMatches[0]?.match ?? null,
    query: `Jay-Z Song ${position}`,
    reasons: selectedMatches.length > 0 ? ["Matched"] : ["Unmatched"],
    selectedMatches,
    setlistSong: {
      artistName: "Jay-Z",
      name: `Song ${position}`,
      position,
    },
    status: selectedMatches.length > 0 ? "matched" : "unmatched",
  };
}

function createNeedsReviewMatch(position: number, trackId: string): SetlistSongMatch {
  const match = {
    artistName: "Different Artist",
    confidence: 1,
    id: trackId,
    name: `Song ${position}`,
    reasons: ["Needs review", "Popular title match — artist not confirmed"],
  };

  return {
    alternatives: [],
    confidence: 1,
    match,
    query: `Song ${position}`,
    reasons: match.reasons,
    selectedMatches: [
      {
        confidence: 1,
        match,
        query: `Song ${position}`,
        reasons: match.reasons,
        segmentTitle: `Song ${position}`,
        status: "needs_review" as const,
      },
    ],
    setlistSong: {
      artistName: "Jay-Z",
      name: `Song ${position}`,
      position,
    },
    status: "needs_review",
  };
}

function createMixedSlashMatch(): SetlistSongMatch {
  return {
    alternatives: [],
    confidence: 1,
    match: {
      artistName: "Mereba",
      confidence: 1,
      id: "bet-track",
      name: "Bet",
      reasons: ["Exact title match", "Artist match"],
    },
    query: "Mereba Bet / You Send Me",
    reasons: ["Matched 1 of 2 title segments", "1 segment needs review"],
    selectedMatches: [
      {
        confidence: 1,
        match: {
          artistName: "Mereba",
          confidence: 1,
          id: "bet-track",
          name: "Bet",
          reasons: ["Exact title match", "Artist match"],
        },
        query: "Mereba Bet",
        reasons: ["Exact title match", "Artist match"],
        segmentTitle: "Bet",
        status: "matched",
      },
      {
        confidence: 1,
        match: {
          artistName: "Sam Cooke",
          confidence: 1,
          id: "sam-cooke-track",
          name: "You Send Me",
          reasons: ["Needs review", "Popular title match — artist not confirmed"],
        },
        query: "You Send Me",
        reasons: ["Needs review", "Popular title match — artist not confirmed"],
        segmentTitle: "You Send Me",
        status: "needs_review",
      },
    ],
    setlistSong: {
      artistName: "Mereba",
      name: "Bet / You Send Me",
      position: 1,
    },
    status: "matched",
  };
}

describe("Apple Music playlist helpers", () => {
  it("preserves setlist and medley order while skipping consecutive duplicates and unmatched songs", () => {
    const tracks = buildAppleMusicPlaylistTracks([
      createSongMatch(1, ["song-1", "song-2", "song-2"]),
      createSongMatch(2, []),
      createSongMatch(3, ["song-3"]),
      createSongMatch(4, ["song-2"]),
      createSongMatch(5, ["song-1"]),
    ]);

    expect(tracks).toEqual([
      { id: "song-1", type: "songs" },
      { id: "song-2", type: "songs" },
      // Consecutive song-2 inside the medley is collapsed.
      { id: "song-3", type: "songs" },
      // Later non-consecutive reprises are kept.
      { id: "song-2", type: "songs" },
      { id: "song-1", type: "songs" },
    ]);
  });

  it("excludes needs-review placeholders unless the user opts them in", () => {
    const reviewMatch = createNeedsReviewMatch(2, "review-track");

    expect(
      buildAppleMusicPlaylistTracks([createSongMatch(1, ["song-1"]), reviewMatch]),
    ).toEqual([{ id: "song-1", type: "songs" }]);

    expect(
      buildAppleMusicPlaylistTracks([createSongMatch(1, ["song-1"]), reviewMatch], {
        includedReviewKeys: new Set(["2:Song 2"]),
      }),
    ).toEqual([
      { id: "song-1", type: "songs" },
      { id: "review-track", type: "songs" },
    ]);
  });

  it("includes confident slash segments while excluding review placeholders by default", () => {
    const mixedMatch = createMixedSlashMatch();

    expect(buildAppleMusicPlaylistTracks([mixedMatch])).toEqual([
      { id: "bet-track", type: "songs" },
    ]);

    expect(
      buildAppleMusicPlaylistTracks([mixedMatch], {
        includedReviewKeys: new Set(["1:Bet / You Send Me:You Send Me"]),
      }),
    ).toEqual([
      { id: "bet-track", type: "songs" },
      { id: "sam-cooke-track", type: "songs" },
    ]);
  });

  it("builds a playlist name from setlist metadata", () => {
    expect(
      buildDefaultAppleMusicPlaylistName({
        artistName: "Jay-Z",
        eventDate: "13-07-2026",
        id: "3b497c60",
        songs: [],
        venue: {
          name: "Yankee Stadium",
        },
      }),
    ).toBe("Jay-Z · Yankee Stadium · 13-07-2026");
  });
});
