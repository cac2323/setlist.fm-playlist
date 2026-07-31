import "server-only";

import { z } from "zod";

import { apiDebug } from "./debug";
import { getAppleMusicDeveloperToken } from "./appleMusicToken";
import {
  getComparableTitleSegments,
  getSearchableSongTitle,
  ScoredAppleMusicTrackMatch,
  selectBestAppleMusicMatch,
  selectTitleOnlyAppleMusicMatch,
} from "./appleMusicMatching";
import type { NormalizedSetlistSong } from "./setlistfm";
import { mapWithConcurrency } from "./mapWithConcurrency";
import { fetchWithUpstreamRetry } from "./upstreamRetry";

const APPLE_MUSIC_MATCH_CONCURRENCY = 5;

const appleMusicSearchResponseSchema = z.object({
  results: z
    .object({
      songs: z
        .object({
          data: z.array(
            z.object({
              id: z.string(),
              attributes: z.object({
                albumName: z.string().optional(),
                artistName: z.string(),
                name: z.string(),
                url: z.string().optional(),
              }),
            }),
          ),
        })
        .optional(),
    })
    .optional(),
});

export type AppleMusicTrackMatch = {
  albumName?: string;
  artistName: string;
  id: string;
  name: string;
  url?: string;
};

export type SetlistSongMatch = {
  alternatives: ScoredAppleMusicTrackMatch[];
  confidence: number;
  match: ScoredAppleMusicTrackMatch | null;
  query: string;
  reasons: string[];
  selectedMatches: SelectedAppleMusicTrack[];
  setlistSong: NormalizedSetlistSong;
  status: "matched" | "needs_review" | "unmatched";
};

export type SelectedAppleMusicTrack = {
  confidence: number;
  match: ScoredAppleMusicTrackMatch;
  query: string;
  reasons: string[];
  segmentTitle: string;
  status: "matched" | "needs_review";
};

export class AppleMusicApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppleMusicApiError";
  }
}

class AppleMusicRateLimitError extends AppleMusicApiError {
  constructor() {
    super("Apple Music API capacity was exceeded.");
    this.name = "AppleMusicRateLimitError";
  }
}

export function buildAppleMusicSearchQuery(song: NormalizedSetlistSong) {
  return `${song.coverArtistName ?? song.artistName} ${getSearchableSongTitle(song)}`.trim();
}

export function buildAppleMusicTitleOnlySearchQuery(song: NormalizedSetlistSong) {
  return getSearchableSongTitle(song).trim();
}

async function searchAppleMusicCatalogSongs(options: {
  developerToken: string;
  limit?: number;
  query: string;
  storefront: string;
}) {
  const url = new URL(
    `https://api.music.apple.com/v1/catalog/${options.storefront}/search`,
  );
  url.searchParams.set("term", options.query);
  url.searchParams.set("types", "songs");
  url.searchParams.set("limit", String(options.limit ?? 5));

  let response: Response;

  try {
    response = await fetchWithUpstreamRetry(
      url,
      {
        headers: {
          Authorization: `Bearer ${options.developerToken}`,
        },
      },
      { label: "Apple Music catalog search" },
    );
  } catch (error) {
    throw error;
  }

  if (!response.ok) {
    const responseBody = await response.text();

    apiDebug("Apple Music catalog search failed", {
      method: "GET",
      responseBody,
      status: response.status,
      statusText: response.statusText,
      url: url.toString(),
    });

    if (response.status === 429) {
      throw new AppleMusicRateLimitError();
    }

    throw new AppleMusicApiError("Unable to search Apple Music.");
  }

  const responseBody: unknown = await response.json();
  const parsedResponse = appleMusicSearchResponseSchema.safeParse(responseBody);

  if (!parsedResponse.success) {
    apiDebug("Apple Music search response validation failed", {
      issues: parsedResponse.error.issues,
      responseBody,
      url: url.toString(),
    });

    throw new AppleMusicApiError("Apple Music returned an unexpected response.");
  }

  return (
    parsedResponse.data.results?.songs?.data.map((songResult) => ({
      albumName: songResult.attributes.albumName,
      artistName: songResult.attributes.artistName,
      id: songResult.id,
      name: songResult.attributes.name,
      url: songResult.attributes.url,
    })) ?? []
  );
}

export function createMockAppleMusicMatch(song: NormalizedSetlistSong): SetlistSongMatch {
  const query = buildAppleMusicSearchQuery(song);
  const match: ScoredAppleMusicTrackMatch = {
    albumName: "Mock Apple Music Result",
    artistName: song.coverArtistName ?? song.artistName,
    confidence: 1,
    id: `mock-${song.position}`,
    name: song.name,
    reasons: ["Mock match"],
  };

  return {
    match,
    alternatives: [],
    confidence: 1,
    query,
    reasons: ["Mock match"],
    selectedMatches: [
      {
        confidence: 1,
        match,
        query,
        reasons: ["Mock match"],
        segmentTitle: song.name,
        status: "matched",
      },
    ],
    setlistSong: song,
    status: "matched",
  };
}

export async function searchAppleMusicCatalog(query: string): Promise<AppleMusicTrackMatch[]> {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return [];
  }

  const developerToken = await getAppleMusicDeveloperToken();
  const storefront = process.env.APPLE_MUSIC_STOREFRONT ?? "us";

  if (!developerToken) {
    if (process.env.APPLE_MUSIC_USE_MOCKS === "true") {
      return [
        {
          albumName: "Mock Apple Music Result",
          artistName: "Mock Artist",
          id: "mock-search-1",
          name: trimmedQuery,
        },
      ];
    }

    throw new AppleMusicApiError(
      "Apple Music credentials are not configured. Set APPLE_MUSIC_DEVELOPER_TOKEN or APPLE_MUSIC_TEAM_ID, APPLE_MUSIC_KEY_ID, and APPLE_MUSIC_PRIVATE_KEY_PATH.",
    );
  }

  return searchAppleMusicCatalogSongs({
    developerToken,
    limit: 8,
    query: trimmedQuery,
    storefront,
  });
}

export async function searchAppleMusicTrack(
  song: NormalizedSetlistSong,
): Promise<SetlistSongMatch> {
  const developerToken = await getAppleMusicDeveloperToken();
  const storefront = process.env.APPLE_MUSIC_STOREFRONT ?? "us";
  const query = buildAppleMusicSearchQuery(song);

  if (!developerToken) {
    if (process.env.APPLE_MUSIC_USE_MOCKS === "true") {
      return createMockAppleMusicMatch(song);
    }

    throw new AppleMusicApiError(
      "Apple Music credentials are not configured. Set APPLE_MUSIC_DEVELOPER_TOKEN or APPLE_MUSIC_TEAM_ID, APPLE_MUSIC_KEY_ID, and APPLE_MUSIC_PRIVATE_KEY_PATH.",
    );
  }

  const candidates = await searchAppleMusicCatalogSongs({
    developerToken,
    query,
    storefront,
  });
  const { alternatives, bestCandidate } = selectBestAppleMusicMatch(song, candidates);

  if (bestCandidate) {
    return {
      alternatives,
      confidence: bestCandidate.confidence,
      match: bestCandidate,
      query,
      reasons: bestCandidate.reasons,
      selectedMatches: [
        {
          confidence: bestCandidate.confidence,
          match: bestCandidate,
          query,
          reasons: bestCandidate.reasons,
          segmentTitle: song.name,
          status: "matched",
        },
      ],
      setlistSong: song,
      status: "matched",
    };
  }

  const titleOnlyQuery = buildAppleMusicTitleOnlySearchQuery(song);
  const titleOnlyCandidates =
    titleOnlyQuery.length > 0
      ? await searchAppleMusicCatalogSongs({
          developerToken,
          query: titleOnlyQuery,
          storefront,
        })
      : [];
  const placeholderMatch = selectTitleOnlyAppleMusicMatch(song, titleOnlyCandidates);

  if (placeholderMatch) {
    return {
      alternatives: alternatives.slice(0, 3),
      confidence: placeholderMatch.confidence,
      match: placeholderMatch,
      query: titleOnlyQuery,
      reasons: placeholderMatch.reasons,
      selectedMatches: [
        {
          confidence: placeholderMatch.confidence,
          match: placeholderMatch,
          query: titleOnlyQuery,
          reasons: placeholderMatch.reasons,
          segmentTitle: song.name,
          status: "needs_review",
        },
      ],
      setlistSong: song,
      status: "needs_review",
    };
  }

  return {
    alternatives,
    confidence: 0,
    match: null,
    query,
    reasons: ["No confident Apple Music match"],
    selectedMatches: [],
    setlistSong: song,
    status: "unmatched",
  };
}

export async function matchSetlistSongsToAppleMusic(songs: NormalizedSetlistSong[]) {
  const queryCache = new Map<string, SetlistSongMatch>();

  async function searchWithCache(song: NormalizedSetlistSong) {
    const query = buildAppleMusicSearchQuery(song);
    const cachedMatch = queryCache.get(query);

    if (cachedMatch) {
      return {
        ...cachedMatch,
        setlistSong: song,
      };
    }

    const match = await searchAppleMusicTrack(song);
    queryCache.set(query, match);
    return match;
  }

  async function matchSong(song: NormalizedSetlistSong) {
    const fullTitleMatch = await searchWithCache(song);
    const titleSegments = getComparableTitleSegments(song.name);

    if (titleSegments.length === 1) {
      return fullTitleMatch;
    }

    const fullTitleCandidates = [fullTitleMatch.match, ...fullTitleMatch.alternatives].filter(
      (candidate): candidate is ScoredAppleMusicTrackMatch => Boolean(candidate),
    );
    const selectedMatches: SelectedAppleMusicTrack[] = [];

    for (const segmentTitle of titleSegments) {
      const segmentSong = {
        ...song,
        name: segmentTitle,
      };
      const candidateFromFullSearch = selectBestAppleMusicMatch(
        segmentSong,
        fullTitleCandidates,
      ).bestCandidate;

      if (candidateFromFullSearch) {
        selectedMatches.push({
          confidence: candidateFromFullSearch.confidence,
          match: candidateFromFullSearch,
          query: fullTitleMatch.query,
          reasons: candidateFromFullSearch.reasons,
          segmentTitle,
          status: "matched",
        });
        continue;
      }

      const segmentMatch = await searchWithCache(segmentSong);

      if (
        (segmentMatch.status === "matched" || segmentMatch.status === "needs_review") &&
        segmentMatch.match
      ) {
        selectedMatches.push({
          confidence: segmentMatch.confidence,
          match: segmentMatch.match,
          query: segmentMatch.query,
          reasons: segmentMatch.reasons,
          segmentTitle,
          status: segmentMatch.status,
        });
      }
    }

    // Collapse duplicate catalog tracks, preferring confident artist matches.
    const uniqueSelectedMatches: SelectedAppleMusicTrack[] = [];
    for (const selectedMatch of selectedMatches) {
      const existingIndex = uniqueSelectedMatches.findIndex(
        (candidate) => candidate.match.id === selectedMatch.match.id,
      );

      if (existingIndex === -1) {
        uniqueSelectedMatches.push(selectedMatch);
        continue;
      }

      if (
        uniqueSelectedMatches[existingIndex]?.status === "needs_review" &&
        selectedMatch.status === "matched"
      ) {
        uniqueSelectedMatches[existingIndex] = selectedMatch;
      }
    }

    if (uniqueSelectedMatches.length === 0) {
      return fullTitleMatch;
    }

    const confidentMatches = uniqueSelectedMatches.filter(
      (selectedMatch) => selectedMatch.status === "matched",
    );
    const reviewMatches = uniqueSelectedMatches.filter(
      (selectedMatch) => selectedMatch.status === "needs_review",
    );
    const [primarySegmentMatch] = confidentMatches.length > 0 ? confidentMatches : uniqueSelectedMatches;
    const preferFullTitle =
      uniqueSelectedMatches.length === 1 &&
      uniqueSelectedMatches[0]?.status === "matched" &&
      fullTitleMatch.status === "matched" &&
      Boolean(fullTitleMatch.match) &&
      fullTitleMatch.confidence >= primarySegmentMatch.confidence;

    if (preferFullTitle) {
      return fullTitleMatch;
    }

    const confidence =
      uniqueSelectedMatches.reduce((total, selectedMatch) => total + selectedMatch.confidence, 0) /
      uniqueSelectedMatches.length;
    const reasons = [
      confidentMatches.length === titleSegments.length
        ? `Matched ${confidentMatches.length} title segments`
        : `Matched ${confidentMatches.length} of ${titleSegments.length} title segments`,
    ];
    if (reviewMatches.length > 0) {
      reasons.push(
        `${reviewMatches.length} ${reviewMatches.length === 1 ? "segment needs" : "segments need"} review`,
      );
    }

    return {
      alternatives: fullTitleMatch.alternatives.filter(
        (alternative) =>
          !uniqueSelectedMatches.some((selectedMatch) => selectedMatch.match.id === alternative.id),
      ),
      confidence,
      match: primarySegmentMatch.match,
      query: fullTitleMatch.query,
      reasons,
      selectedMatches: uniqueSelectedMatches,
      setlistSong: song,
      status: confidentMatches.length > 0 ? ("matched" as const) : ("needs_review" as const),
    };
  }

  function createUnmatchedSong(song: NormalizedSetlistSong, reason: string): SetlistSongMatch {
    return {
      alternatives: [],
      confidence: 0,
      match: null,
      query: buildAppleMusicSearchQuery(song),
      reasons: [reason],
      selectedMatches: [],
      setlistSong: song,
      status: "unmatched",
    };
  }

  let rateLimited = false;

  return mapWithConcurrency(
    songs,
    APPLE_MUSIC_MATCH_CONCURRENCY,
    async (song) => {
      try {
        return await matchSong(song);
      } catch (error) {
        if (error instanceof AppleMusicRateLimitError) {
          rateLimited = true;
          return createUnmatchedSong(
            song,
            "Apple Music API capacity was exceeded before this song could be searched.",
          );
        }

        throw error;
      }
    },
    {
      shouldStop: () => rateLimited,
      onStopped: (song) =>
        createUnmatchedSong(song, "Skipped because Apple Music API capacity was exceeded."),
    },
  );
}
