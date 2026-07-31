import { describe, expect, it } from "vitest";

import type { SetlistSongMatch } from "./appleMusic";
import { applySelectedTrack, selectAlternateTrack } from "./matchSelection";

function createMatchedSong(): SetlistSongMatch {
  return {
    alternatives: [
      {
        artistName: "Karaoke Band",
        confidence: 0.4,
        id: "alt-1",
        name: "Encore",
        reasons: ["Title match"],
      },
      {
        artistName: "JAY-Z",
        confidence: 0.9,
        id: "alt-2",
        name: "Encore (Live)",
        reasons: ["Artist match"],
      },
    ],
    confidence: 0.95,
    match: {
      artistName: "Wrong Artist",
      confidence: 0.95,
      id: "primary-1",
      name: "Encore",
      reasons: ["Exact title match"],
    },
    query: "Jay-Z Encore",
    reasons: ["Exact title match"],
    selectedMatches: [
      {
        confidence: 0.95,
        match: {
          artistName: "Wrong Artist",
          confidence: 0.95,
          id: "primary-1",
          name: "Encore",
          reasons: ["Exact title match"],
        },
        query: "Jay-Z Encore",
        reasons: ["Exact title match"],
        segmentTitle: "Encore",
        status: "matched",
      },
    ],
    setlistSong: {
      artistName: "Jay-Z",
      name: "Encore",
      position: 1,
    },
    status: "matched",
  };
}

describe("matchSelection", () => {
  it("swaps a matched track with an alternative", () => {
    const result = selectAlternateTrack(createMatchedSong(), { alternativeId: "alt-2" });

    expect(result.match?.id).toBe("alt-2");
    expect(result.selectedMatches[0]?.match.id).toBe("alt-2");
    expect(result.selectedMatches[0]?.status).toBe("matched");
    expect(result.status).toBe("matched");
    expect(result.alternatives.map((alternative) => alternative.id)).toEqual([
      "primary-1",
      "alt-1",
    ]);
  });

  it("promotes an unmatched song when applying a track", () => {
    const unmatched: SetlistSongMatch = {
      alternatives: [],
      confidence: 0,
      match: null,
      query: "Jay-Z Rare Song",
      reasons: ["No confident Apple Music match"],
      selectedMatches: [],
      setlistSong: {
        artistName: "Jay-Z",
        name: "Rare Song",
        position: 2,
      },
      status: "unmatched",
    };

    const result = applySelectedTrack(unmatched, {
      reason: "Manual search",
      track: {
        artistName: "JAY-Z",
        id: "search-1",
        name: "Rare Song",
      },
    });

    expect(result.status).toBe("matched");
    expect(result.match?.id).toBe("search-1");
    expect(result.selectedMatches).toHaveLength(1);
    expect(result.selectedMatches[0]?.status).toBe("matched");
    expect(result.reasons).toContain("Manual search");
  });

  it("targets a specific medley segment", () => {
    const medley: SetlistSongMatch = {
      alternatives: [
        {
          artistName: "Mereba",
          confidence: 0.8,
          id: "send-me-alt",
          name: "You Send Me",
          reasons: ["Title match"],
        },
      ],
      confidence: 1,
      match: {
        artistName: "Mereba",
        confidence: 1,
        id: "bet-track",
        name: "Bet",
        reasons: ["Exact title match"],
      },
      query: "Mereba Bet / You Send Me",
      reasons: ["Matched 1 of 2 title segments"],
      selectedMatches: [
        {
          confidence: 1,
          match: {
            artistName: "Mereba",
            confidence: 1,
            id: "bet-track",
            name: "Bet",
            reasons: ["Exact title match"],
          },
          query: "Mereba Bet / You Send Me",
          reasons: ["Exact title match"],
          segmentTitle: "Bet",
          status: "matched",
        },
        {
          confidence: 0.7,
          match: {
            artistName: "Other Artist",
            confidence: 0.7,
            id: "placeholder",
            name: "You Send Me",
            reasons: ["Needs review"],
          },
          query: "Mereba You Send Me",
          reasons: ["Needs review"],
          segmentTitle: "You Send Me",
          status: "needs_review",
        },
      ],
      setlistSong: {
        artistName: "Mereba",
        name: "Bet / You Send Me",
        position: 3,
      },
      status: "needs_review",
    };

    const result = selectAlternateTrack(medley, {
      alternativeId: "send-me-alt",
      segmentTitle: "You Send Me",
    });

    expect(result.selectedMatches[0]?.match.id).toBe("bet-track");
    expect(result.selectedMatches[1]?.match.id).toBe("send-me-alt");
    expect(result.selectedMatches[1]?.status).toBe("matched");
    expect(result.status).toBe("matched");
    expect(result.alternatives.map((alternative) => alternative.id)).toContain("placeholder");
  });

  it("clears needs_review when the user selects a track", () => {
    const needsReview: SetlistSongMatch = {
      alternatives: [
        {
          artistName: "JAY-Z",
          confidence: 0.85,
          id: "better",
          name: "Song 2",
          reasons: ["Artist match"],
        },
      ],
      confidence: 1,
      match: {
        artistName: "Different Artist",
        confidence: 1,
        id: "placeholder",
        name: "Song 2",
        reasons: ["Needs review"],
      },
      query: "Song 2",
      reasons: ["Needs review"],
      selectedMatches: [
        {
          confidence: 1,
          match: {
            artistName: "Different Artist",
            confidence: 1,
            id: "placeholder",
            name: "Song 2",
            reasons: ["Needs review"],
          },
          query: "Song 2",
          reasons: ["Needs review"],
          segmentTitle: "Song 2",
          status: "needs_review",
        },
      ],
      setlistSong: {
        artistName: "Jay-Z",
        name: "Song 2",
        position: 2,
      },
      status: "needs_review",
    };

    const result = selectAlternateTrack(needsReview, { alternativeId: "better" });

    expect(result.status).toBe("matched");
    expect(result.selectedMatches[0]?.status).toBe("matched");
    expect(result.match?.id).toBe("better");
  });

  it("returns the original match when the alternative id is unknown", () => {
    const original = createMatchedSong();
    expect(selectAlternateTrack(original, { alternativeId: "missing" })).toBe(original);
  });
});
