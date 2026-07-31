import "server-only";

import { z } from "zod";

import type {
  AppleMusicTrackMatch,
  SelectedAppleMusicTrack,
  SetlistSongMatch,
} from "./appleMusic";
import {
  getComparableTitleSegments,
  getRemixDescriptor,
  getSearchableTitle,
  ScoredAppleMusicTrackMatch,
  selectBestAppleMusicMatch,
  selectTitleOnlyAppleMusicMatch,
} from "./appleMusicMatching";
import { apiDebug } from "./debug";
import { NormalizedSetlistSong } from "./setlistfm";
import { getSpotifyClientCredentialsToken } from "./spotifyToken";
import { mapWithConcurrency } from "./mapWithConcurrency";
import { fetchWithUpstreamRetry } from "./upstreamRetry";

const SPOTIFY_MATCH_CONCURRENCY = 5;

const spotifySearchResponseSchema = z.object({
  tracks: z
    .object({
      items: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          external_urls: z
            .object({
              spotify: z.string().optional(),
            })
            .optional(),
          album: z
            .object({
              name: z.string().optional(),
            })
            .optional(),
          artists: z.array(
            z.object({
              name: z.string(),
            }),
          ),
        }),
      ),
    })
    .nullable()
    .optional(),
});

export class SpotifyApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpotifyApiError";
  }
}

class SpotifyRateLimitError extends SpotifyApiError {
  constructor() {
    super("Spotify API capacity was exceeded.");
    this.name = "SpotifyRateLimitError";
  }
}

function getSpotifySearchableTitle(value: string) {
  // Prefer uncensored roots for Spotify catalog search.
  return getSearchableTitle(value)
    .replace(/f\*ck/gi, "fuck")
    .replace(/sh\*t/gi, "shit")
    .replace(/b\*tch/gi, "bitch");
}

export function getSpotifySearchableSongTitle(song: NormalizedSetlistSong) {
  const title = getSpotifySearchableTitle(song.name);
  const remixDescriptor = getRemixDescriptor(song.info);

  return remixDescriptor ? `${title} ${remixDescriptor}` : title;
}

export function buildSpotifySearchQuery(song: NormalizedSetlistSong) {
  return `${song.coverArtistName ?? song.artistName} ${getSpotifySearchableSongTitle(song)}`.trim();
}

export function buildSpotifyTitleOnlySearchQuery(song: NormalizedSetlistSong) {
  return getSpotifySearchableSongTitle(song).trim();
}

function mapSpotifyTrack(track: {
  album?: { name?: string };
  artists: Array<{ name: string }>;
  external_urls?: { spotify?: string };
  id: string;
  name: string;
}): AppleMusicTrackMatch {
  return {
    albumName: track.album?.name,
    artistName: track.artists.map((artist) => artist.name).join(", "),
    id: track.id,
    name: track.name,
    url: track.external_urls?.spotify,
  };
}

export type SpotifyCatalogSearchOptions = {
  /** Prefer the signed-in user's token so Spotify can resolve their market. */
  accessToken?: string;
  /** Required for client-credentials search when no user token is available. */
  market?: string;
};

function getClientCredentialsMarket(explicitMarket?: string) {
  return explicitMarket?.trim() || process.env.SPOTIFY_MARKET?.trim() || "US";
}

async function resolveSpotifyCatalogAccess(options?: SpotifyCatalogSearchOptions) {
  if (options?.accessToken) {
    return {
      accessToken: options.accessToken,
      // User tokens carry account country; only set market when explicitly asked.
      market: options.market?.trim() || undefined,
    };
  }

  const accessToken = await getSpotifyClientCredentialsToken();
  if (!accessToken) {
    return null;
  }

  return {
    accessToken,
    market: getClientCredentialsMarket(options?.market),
  };
}

async function searchSpotifyCatalogTracks(options: {
  accessToken: string;
  market?: string;
  query: string;
}) {
  const url = new URL("https://api.spotify.com/v1/search");
  url.searchParams.set("q", options.query);
  url.searchParams.set("type", "track");
  url.searchParams.set("limit", "5");
  // Client-credentials tokens have no user country; without market, Spotify
  // treats catalog content as unavailable and search fails.
  if (options.market) {
    url.searchParams.set("market", options.market);
  }

  let response: Response;

  try {
    response = await fetchWithUpstreamRetry(
      url,
      {
        headers: {
          Authorization: `Bearer ${options.accessToken}`,
          Accept: "application/json",
        },
      },
      { label: "Spotify catalog search" },
    );
  } catch (error) {
    apiDebug("Spotify catalog search network failure", {
      errorMessage: error instanceof Error ? error.message : "Unknown error",
      method: "GET",
      url: url.toString(),
    });
    throw new SpotifyApiError("Unable to search Spotify.");
  }

  if (!response.ok) {
    const responseBody = await response.text();

    apiDebug("Spotify catalog search failed", {
      method: "GET",
      responseBody,
      status: response.status,
      statusText: response.statusText,
      url: url.toString(),
    });

    if (response.status === 429) {
      throw new SpotifyRateLimitError();
    }

    if (response.status === 403) {
      throw new SpotifyApiError(
        "Spotify denied catalog search. Confirm the Spotify app owner has Premium and try reconnecting.",
      );
    }

    throw new SpotifyApiError("Unable to search Spotify.");
  }

  const responseBody: unknown = await response.json();
  const parsedResponse = spotifySearchResponseSchema.safeParse(responseBody);

  if (!parsedResponse.success) {
    apiDebug("Spotify search response validation failed", {
      issues: parsedResponse.error.issues,
      responseBody,
      url: url.toString(),
    });

    throw new SpotifyApiError("Spotify returned an unexpected response.");
  }

  return (parsedResponse.data.tracks?.items ?? []).map(mapSpotifyTrack);
}

export async function searchSpotifyCatalog(
  query: string,
  options?: SpotifyCatalogSearchOptions,
): Promise<AppleMusicTrackMatch[]> {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return [];
  }

  const catalogAccess = await resolveSpotifyCatalogAccess(options);

  if (!catalogAccess) {
    if (process.env.SPOTIFY_USE_MOCKS === "true") {
      return [
        {
          albumName: "Mock Spotify Result",
          artistName: "Mock Artist",
          id: "mock-spotify-search-1",
          name: trimmedQuery,
        },
      ];
    }

    throw new SpotifyApiError(
      "Spotify credentials are not configured. Set SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and SPOTIFY_REDIRECT_URI.",
    );
  }

  return searchSpotifyCatalogTracks({
    accessToken: catalogAccess.accessToken,
    market: catalogAccess.market,
    query: trimmedQuery,
  });
}

export function createMockSpotifyMatch(song: NormalizedSetlistSong): SetlistSongMatch {
  const query = buildSpotifySearchQuery(song);
  const match: ScoredAppleMusicTrackMatch = {
    albumName: "Mock Spotify Result",
    artistName: song.coverArtistName ?? song.artistName,
    confidence: 1,
    id: `mock-spotify-${song.position}`,
    name: song.name,
    reasons: ["Mock match"],
  };

  return {
    alternatives: [],
    confidence: 1,
    match,
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

export async function searchSpotifyTrack(
  song: NormalizedSetlistSong,
  options?: SpotifyCatalogSearchOptions,
): Promise<SetlistSongMatch> {
  const catalogAccess = await resolveSpotifyCatalogAccess(options);
  const query = buildSpotifySearchQuery(song);

  if (!catalogAccess) {
    if (process.env.SPOTIFY_USE_MOCKS === "true") {
      return createMockSpotifyMatch(song);
    }

    throw new SpotifyApiError(
      "Spotify credentials are not configured. Set SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and SPOTIFY_REDIRECT_URI.",
    );
  }

  const { accessToken, market } = catalogAccess;
  const candidates = await searchSpotifyCatalogTracks({
    accessToken,
    market,
    query,
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

  const titleOnlyQuery = buildSpotifyTitleOnlySearchQuery(song);
  const titleOnlyCandidates =
    titleOnlyQuery.length > 0
      ? await searchSpotifyCatalogTracks({
          accessToken,
          market,
          query: titleOnlyQuery,
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
    reasons: ["No confident Spotify match"],
    selectedMatches: [],
    setlistSong: song,
    status: "unmatched",
  };
}

export async function matchSetlistSongsToSpotify(
  songs: NormalizedSetlistSong[],
  options?: SpotifyCatalogSearchOptions,
) {
  const queryCache = new Map<string, SetlistSongMatch>();

  async function searchWithCache(song: NormalizedSetlistSong) {
    const query = buildSpotifySearchQuery(song);
    const cachedMatch = queryCache.get(query);

    if (cachedMatch) {
      return {
        ...cachedMatch,
        setlistSong: song,
      };
    }

    const match = await searchSpotifyTrack(song, options);
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
    const [primarySegmentMatch] =
      confidentMatches.length > 0 ? confidentMatches : uniqueSelectedMatches;
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
      query: buildSpotifySearchQuery(song),
      reasons: [reason],
      selectedMatches: [],
      setlistSong: song,
      status: "unmatched",
    };
  }

  let rateLimited = false;

  return mapWithConcurrency(
    songs,
    SPOTIFY_MATCH_CONCURRENCY,
    async (song) => {
      try {
        return await matchSong(song);
      } catch (error) {
        if (error instanceof SpotifyRateLimitError) {
          rateLimited = true;
          return createUnmatchedSong(
            song,
            "Spotify API capacity was exceeded before this song could be searched.",
          );
        }

        throw error;
      }
    },
    {
      shouldStop: () => rateLimited,
      onStopped: (song) =>
        createUnmatchedSong(song, "Skipped because Spotify API capacity was exceeded."),
    },
  );
}
