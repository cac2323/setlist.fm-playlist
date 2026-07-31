import { describe, expect, it } from "vitest";

import type { SetlistSongMatch } from "./appleMusic";
import {
  classifySongMatchStatus,
  countMatchStatuses,
  filterMatchesByStatus,
  getDefaultMatchStatusFilter,
  getEmptyMatchFilterMessage,
  resolveActiveStatusFilter,
  shouldKeepStatusFilterTab,
} from "./matchStatusFilter";

function matchedSong(name: string, position: number): SetlistSongMatch {
  return {
    alternatives: [],
    confidence: 1,
    match: {
      artistName: "JAY-Z",
      confidence: 1,
      id: `matched-${position}`,
      name,
      reasons: ["Exact title match"],
    },
    query: `Jay-Z ${name}`,
    reasons: ["Exact title match"],
    selectedMatches: [
      {
        confidence: 1,
        match: {
          artistName: "JAY-Z",
          confidence: 1,
          id: `matched-${position}`,
          name,
          reasons: ["Exact title match"],
        },
        query: `Jay-Z ${name}`,
        reasons: ["Exact title match"],
        segmentTitle: name,
        status: "matched",
      },
    ],
    setlistSong: { artistName: "Jay-Z", name, position },
    status: "matched",
  };
}

function needsReviewSong(name: string, position: number): SetlistSongMatch {
  return {
    alternatives: [],
    confidence: 0.4,
    match: {
      artistName: "Wrong Artist",
      confidence: 0.4,
      id: `review-${position}`,
      name,
      reasons: ["Title-only match"],
    },
    query: `Jay-Z ${name}`,
    reasons: ["Artist not confirmed"],
    selectedMatches: [
      {
        confidence: 0.4,
        match: {
          artistName: "Wrong Artist",
          confidence: 0.4,
          id: `review-${position}`,
          name,
          reasons: ["Title-only match"],
        },
        query: `Jay-Z ${name}`,
        reasons: ["Artist not confirmed"],
        segmentTitle: name,
        status: "needs_review",
      },
    ],
    setlistSong: { artistName: "Jay-Z", name, position },
    status: "needs_review",
  };
}

function unmatchedSong(name: string, position: number): SetlistSongMatch {
  return {
    alternatives: [],
    confidence: 0,
    match: null,
    query: `Jay-Z ${name}`,
    reasons: ["No confident Apple Music match"],
    selectedMatches: [],
    setlistSong: { artistName: "Jay-Z", name, position },
    status: "unmatched",
  };
}

describe("matchStatusFilter", () => {
  it("classifies matched, needs_review, and unmatched songs", () => {
    expect(classifySongMatchStatus(matchedSong("Encore", 1))).toBe("matched");
    expect(classifySongMatchStatus(needsReviewSong("99 Problems", 2))).toBe("needs_review");
    expect(classifySongMatchStatus(unmatchedSong("Rare Cut", 3))).toBe("unmatched");
  });

  it("classifies medleys with a review segment as needs_review", () => {
    const medley: SetlistSongMatch = {
      alternatives: [],
      confidence: 1,
      match: {
        artistName: "Mereba",
        confidence: 1,
        id: "seg-1",
        name: "Kinfolk",
        reasons: ["Exact title match"],
      },
      query: "Mereba Kinfolk / You Send Me",
      reasons: ["Medley segments"],
      selectedMatches: [
        {
          confidence: 1,
          match: {
            artistName: "Mereba",
            confidence: 1,
            id: "seg-1",
            name: "Kinfolk",
            reasons: ["Exact title match"],
          },
          query: "Mereba Kinfolk",
          reasons: ["Exact title match"],
          segmentTitle: "Kinfolk",
          status: "matched",
        },
        {
          confidence: 0.3,
          match: {
            artistName: "Other Artist",
            confidence: 0.3,
            id: "seg-2",
            name: "You Send Me",
            reasons: ["Title-only match"],
          },
          query: "Mereba You Send Me",
          reasons: ["Artist not confirmed"],
          segmentTitle: "You Send Me",
          status: "needs_review",
        },
      ],
      setlistSong: {
        artistName: "Mereba",
        name: "Kinfolk / You Send Me",
        position: 1,
      },
      status: "matched",
    };

    expect(classifySongMatchStatus(medley)).toBe("needs_review");
  });

  it("counts statuses and defaults to the first work filter", () => {
    const matches = [
      matchedSong("Encore", 1),
      needsReviewSong("99 Problems", 2),
      unmatchedSong("Rare Cut", 3),
      matchedSong("Run This Town", 4),
    ];

    const counts = countMatchStatuses(matches);
    expect(counts).toEqual({
      all: 4,
      matched: 2,
      needs_review: 1,
      unmatched: 1,
    });
    expect(getDefaultMatchStatusFilter(counts)).toBe("needs_review");
    expect(
      getDefaultMatchStatusFilter({ all: 2, matched: 1, needs_review: 0, unmatched: 1 }),
    ).toBe("unmatched");
    expect(
      getDefaultMatchStatusFilter({ all: 2, matched: 2, needs_review: 0, unmatched: 0 }),
    ).toBe("all");
  });

  it("filters matches while preserving setlist order", () => {
    const matches = [
      matchedSong("Encore", 1),
      needsReviewSong("99 Problems", 2),
      unmatchedSong("Rare Cut", 3),
      matchedSong("Run This Town", 4),
    ];

    expect(filterMatchesByStatus(matches, "all").map((m) => m.setlistSong.position)).toEqual([
      1, 2, 3, 4,
    ]);
    expect(
      filterMatchesByStatus(matches, "matched").map((m) => m.setlistSong.name),
    ).toEqual(["Encore", "Run This Town"]);
    expect(
      filterMatchesByStatus(matches, "needs_review").map((m) => m.setlistSong.name),
    ).toEqual(["99 Problems"]);
    expect(
      filterMatchesByStatus(matches, "unmatched").map((m) => m.setlistSong.name),
    ).toEqual(["Rare Cut"]);
  });

  it("keeps retained matches visible in the active work filter", () => {
    const matches = [
      matchedSong("Encore", 1),
      needsReviewSong("99 Problems", 2),
    ];
    const fixed = matchedSong("99 Problems", 2);
    const afterFix = [matches[0]!, fixed];
    const retainKeys = new Set(["2:99 Problems"]);

    expect(
      filterMatchesByStatus(afterFix, "needs_review", retainKeys).map((m) => m.setlistSong.name),
    ).toEqual(["99 Problems"]);
    expect(shouldKeepStatusFilterTab("needs_review", countMatchStatuses(afterFix), "needs_review", 1)).toBe(
      true,
    );
    expect(
      resolveActiveStatusFilter(
        "needs_review",
        countMatchStatuses(afterFix),
        "needs_review",
        1,
      ),
    ).toBe("needs_review");
  });

  it("returns empty-state copy per filter", () => {
    expect(getEmptyMatchFilterMessage("needs_review")).toBe("No songs need review.");
    expect(getEmptyMatchFilterMessage("unmatched")).toBe("No unmatched songs.");
    expect(getEmptyMatchFilterMessage("matched")).toBe("No matched songs.");
  });
});
