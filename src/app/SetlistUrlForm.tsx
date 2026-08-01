"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import type { AppleMusicTrackMatch, SetlistSongMatch } from "@/lib/appleMusic";
import {
  authorizeAppleMusic,
  createAppleMusicPlaylist,
  getAppleMusicAuthorizationStatus,
  subscribeToAppleMusicAuthorization,
} from "@/lib/appleMusicAuth";
import {
  buildAppleMusicPlaylistTracks,
  buildDefaultAppleMusicPlaylistName,
  getSelectedMatchReviewKey,
  getSetlistSongMatchKey,
} from "@/lib/appleMusicPlaylist";
import {
  clearPendingAppleMusicMatch,
  readPendingAppleMusicMatch,
  savePendingAppleMusicMatch,
} from "@/lib/pendingAppleMusicMatch";
import {
  clearPendingSpotifyMatch,
  readPendingSpotifyMatch,
  savePendingSpotifyMatch,
} from "@/lib/pendingSpotifyMatch";
import { navigateTo } from "@/lib/browserNavigation";
import {
  getDestinationLabel,
  isSpotifyDestinationEnabled,
  PlaylistDestination,
} from "@/lib/playlistDestination";
import { applySelectedTrack, selectAlternateTrack } from "@/lib/matchSelection";
import {
  matchSongsWithProgress,
  type MatchProgress,
} from "@/lib/matchSongsWithProgress";
import type { ParsedSetlistUrl } from "@/lib/setlistUrl";
import { parseSetlistUrl } from "@/lib/setlistUrl";
import type { NormalizedSetlist } from "@/lib/setlistfm";
import {
  createSpotifyPlaylist,
  getSpotifyAuthorizationStatus,
  subscribeToSpotifyAuthorization,
} from "@/lib/spotifyAuthClient";
import { buildSpotifyPlaylistTrackUris } from "@/lib/spotifyPlaylistTracks";

import styles from "./page.module.css";
import { WorkflowStepId, WorkflowStepper } from "./WorkflowStepper";
import { LoadSetlistStep } from "./workflow/LoadSetlistStep";
import { PlaylistResultStep } from "./workflow/PlaylistResultStep";
import { ReviewMatchesStep } from "./workflow/ReviewMatchesStep";

type SetlistUrlFormProps = {
  initialAppleMusicMatches?: SetlistSongMatch[];
  initialDestination?: PlaylistDestination;
  initialErrorMessage?: string;
  initialFetchErrorMessage?: string;
  initialFetchedSetlist?: NormalizedSetlist;
  initialMatchErrorMessage?: string;
  initialParsedSetlist?: ParsedSetlistUrl;
  initialSetlistUrl?: string;
};

function clearSpotifyAuthQueryParams() {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  if (
    !url.searchParams.has("spotify_auth") &&
    !url.searchParams.has("spotify_auth_error") &&
    !url.searchParams.has("spotify_match")
  ) {
    return;
  }

  url.searchParams.delete("spotify_auth");
  url.searchParams.delete("spotify_auth_error");
  url.searchParams.delete("spotify_match");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

export function SetlistUrlForm({
  initialAppleMusicMatches,
  initialDestination = "apple-music",
  initialErrorMessage,
  initialFetchErrorMessage,
  initialFetchedSetlist,
  initialMatchErrorMessage,
  initialParsedSetlist,
  initialSetlistUrl = "",
}: SetlistUrlFormProps) {
  const [setlistUrl, setSetlistUrl] = useState(initialSetlistUrl);
  const [parsedSetlist, setParsedSetlist] = useState<ParsedSetlistUrl | null>(
    initialParsedSetlist ?? null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(
    initialErrorMessage ?? initialFetchErrorMessage ?? null,
  );
  const [fetchedSetlist, setFetchedSetlist] = useState<NormalizedSetlist | null>(
    initialFetchedSetlist ?? null,
  );
  const [destination, setDestination] = useState<PlaylistDestination>(initialDestination);
  const [matchingDestination, setMatchingDestination] = useState<PlaylistDestination | null>(null);
  const [isFetchingSetlist, setIsFetchingSetlist] = useState(false);
  const [catalogMatches, setCatalogMatches] = useState<SetlistSongMatch[]>(
    initialAppleMusicMatches ?? [],
  );
  const [matchErrorMessage, setMatchErrorMessage] = useState<string | null>(
    initialMatchErrorMessage ?? null,
  );
  const [isMatchingTracks, setIsMatchingTracks] = useState(false);
  const [matchProgress, setMatchProgress] = useState<MatchProgress | null>(null);
  const [isAppleMusicAuthorized, setIsAppleMusicAuthorized] = useState(false);
  const [isSpotifyAuthorized, setIsSpotifyAuthorized] = useState(false);
  const [playlistName, setPlaylistName] = useState(() =>
    initialFetchedSetlist ? buildDefaultAppleMusicPlaylistName(initialFetchedSetlist) : "",
  );
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [playlistErrorMessage, setPlaylistErrorMessage] = useState<string | null>(null);
  const [createdPlaylist, setCreatedPlaylist] = useState<{
    id: string;
    name: string;
    trackCount: number;
    url?: string;
  } | null>(null);
  const [includedReviewKeys, setIncludedReviewKeys] = useState<Set<string>>(() => new Set());
  const [activeStep, setActiveStep] = useState<WorkflowStepId>(() =>
    initialAppleMusicMatches && initialAppleMusicMatches.length > 0
      ? "create"
      : "load",
  );
  const activeHeadingRef = useRef<HTMLHeadingElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const focusTargetRef = useRef<"heading" | "url">("heading");
  const [focusEpoch, setFocusEpoch] = useState(0);

  useEffect(() => {
    if (focusTargetRef.current === "url" && activeStep === "load") {
      urlInputRef.current?.focus();
      focusTargetRef.current = "heading";
      return;
    }

    activeHeadingRef.current?.focus();
  }, [activeStep, focusEpoch]);

  // Browser back from Spotify OAuth often restores this page from bfcache with
  // matching UI still locked ("Connecting to Spotify..."). Unlock so the user
  // can pick Apple Music or retry Spotify. Do not clear pending match intent —
  // a completed OAuth redirect still needs it, and abandon is harmless.
  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      if (!event.persisted) {
        return;
      }

      setIsMatchingTracks(false);
      setMatchingDestination(null);
    }

    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  useEffect(() => {
    let isActive = true;

    // Spotify OAuth cookies are host-only on 127.0.0.1. Keep the app on that host
    // so pending sessionStorage and auth cookies share an origin.
    if (
      isSpotifyDestinationEnabled &&
      typeof window !== "undefined" &&
      window.location.hostname === "localhost"
    ) {
      const canonical = new URL(window.location.href);
      canonical.hostname = "127.0.0.1";
      window.location.replace(canonical.toString());
      return;
    }

    const unsubscribeApple = subscribeToAppleMusicAuthorization((isAuthorized) => {
      if (isActive) {
        setIsAppleMusicAuthorized(isAuthorized);
      }
    });
    const unsubscribeSpotify = isSpotifyDestinationEnabled
      ? subscribeToSpotifyAuthorization((isAuthorized) => {
          if (isActive) {
            setIsSpotifyAuthorized(isAuthorized);
          }
        })
      : () => {};

    void getAppleMusicAuthorizationStatus()
      .then((isAuthorized) => {
        if (isActive) {
          setIsAppleMusicAuthorized(isAuthorized);
        }
      })
      .catch(() => {});

    if (isSpotifyDestinationEnabled) {
      void getSpotifyAuthorizationStatus()
        .then((result) => {
          if (isActive) {
            setIsSpotifyAuthorized(result.connected);
          }
        })
        .catch(() => {});
    }

    return () => {
      isActive = false;
      unsubscribeApple();
      unsubscribeSpotify();
    };
  }, []);

  async function fetchSetlistById(id: string) {
    const response = await fetch(`/api/setlist?id=${encodeURIComponent(id)}`);
    const responseBody: unknown = await response.json();

    if (!response.ok) {
      const message =
        responseBody &&
        typeof responseBody === "object" &&
        "error" in responseBody &&
        typeof responseBody.error === "string"
          ? responseBody.error
          : "Unable to fetch that setlist.";
      throw new Error(message);
    }

    if (!responseBody || typeof responseBody !== "object" || !("setlist" in responseBody)) {
      throw new Error("Unexpected response from the setlist API.");
    }

    return responseBody.setlist as NormalizedSetlist;
  }

  async function runCatalogMatch(
    nextDestination: PlaylistDestination,
    setlist: NormalizedSetlist,
  ) {
    const matchEndpoint =
      nextDestination === "spotify" ? "/api/spotify/match" : "/api/apple-music/match";
    const destinationLabel = getDestinationLabel(nextDestination);

    setIsMatchingTracks(true);
    setMatchingDestination(nextDestination);
    setMatchProgress({ completed: 0, total: setlist.songs.length });
    setMatchErrorMessage(null);
    setCreatedPlaylist(null);
    setPlaylistErrorMessage(null);
    setIncludedReviewKeys(new Set());

    try {
      const matches = await matchSongsWithProgress({
        endpoint: matchEndpoint,
        onProgress: setMatchProgress,
        songs: setlist.songs,
      });
      setCatalogMatches(matches);
      setDestination(nextDestination);
      setActiveStep("create");
      if (nextDestination === "apple-music") {
        clearPendingAppleMusicMatch();
      }
    } catch (error) {
      setCatalogMatches([]);
      setMatchErrorMessage(
        error instanceof Error
          ? error.message
          : `Unable to match ${destinationLabel} tracks.`,
      );
      setActiveStep("load");
    } finally {
      setIsMatchingTracks(false);
      setMatchingDestination(null);
      setMatchProgress(null);
    }
  }

  async function handleMatchWithDestination(nextDestination: PlaylistDestination) {
    if (nextDestination === "spotify" && !isSpotifyDestinationEnabled) {
      setMatchErrorMessage("Spotify matching is not available yet.");
      return;
    }
    if (!fetchedSetlist) {
      setMatchErrorMessage("Load a setlist before matching.");
      return;
    }

    let resolvedParsed = parsedSetlist;
    if (!resolvedParsed) {
      try {
        resolvedParsed = parseSetlistUrl(setlistUrl);
        setParsedSetlist(resolvedParsed);
      } catch {
        // Fall back to fetched setlist id + current URL string when possible.
        if (!fetchedSetlist.id || !setlistUrl.trim()) {
          setMatchErrorMessage("Missing setlist URL. Load the setlist again.");
          return;
        }
        resolvedParsed = {
          id: fetchedSetlist.id,
          url: setlistUrl.trim(),
        };
        setParsedSetlist(resolvedParsed);
      }
    }

    setDestination(nextDestination);
    setCatalogMatches([]);
    setIncludedReviewKeys(new Set());
    setCreatedPlaylist(null);
    setPlaylistErrorMessage(null);
    setMatchErrorMessage(null);
    setIsMatchingTracks(true);
    setMatchingDestination(nextDestination);

    try {
      if (nextDestination === "apple-music") {
        // MusicKit on mobile often full-page redirects; persist intent so we can
        // resume matching after return (React state is wiped).
        savePendingAppleMusicMatch({
          setlistId: resolvedParsed.id,
          setlistUrl: resolvedParsed.url,
        });
        const isAuthorized = await getAppleMusicAuthorizationStatus();
        if (!isAuthorized) {
          await authorizeAppleMusic();
          setIsAppleMusicAuthorized(true);
        }
      } else {
        if (window.location.hostname === "localhost") {
          setIsMatchingTracks(false);
          setMatchingDestination(null);
          const canonical = new URL(window.location.href);
          canonical.hostname = "127.0.0.1";
          window.location.replace(canonical.toString());
          return;
        }

        // Spotify is invite-only: save intent and explain on /spotify-access.
        savePendingSpotifyMatch({
          setlistId: resolvedParsed.id,
          setlistUrl: resolvedParsed.url,
        });
        setIsMatchingTracks(false);
        setMatchingDestination(null);
        navigateTo("/spotify-access");
        return;
      }

      await runCatalogMatch(nextDestination, fetchedSetlist);
    } catch (error) {
      setIsMatchingTracks(false);
      setMatchingDestination(null);
      setMatchErrorMessage(
        error instanceof Error
          ? error.message
          : `Unable to authorize ${getDestinationLabel(nextDestination)}.`,
      );
    }
  }

  useEffect(() => {
    if (!isSpotifyDestinationEnabled || typeof window === "undefined") {
      return;
    }

    // Let the canonical-host effect move localhost → 127.0.0.1 first.
    if (window.location.hostname === "localhost") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const authResult = params.get("spotify_auth");
    const resumeMatchOnly = params.get("spotify_match") === "1";

    if (!authResult && !resumeMatchOnly) {
      return;
    }

    const pending = readPendingSpotifyMatch();
    const authError = params.get("spotify_auth_error");
    let cancelled = false;

    async function resumeAfterSpotifyAuth() {
      // Yield so React Strict Mode can cancel this mount before we mutate
      // sessionStorage / the URL (those must survive for the remounted effect).
      await Promise.resolve();
      if (cancelled) {
        return;
      }

      if (resumeMatchOnly && !authResult) {
        if (!pending) {
          clearSpotifyAuthQueryParams();
          setDestination("spotify");
          setMatchErrorMessage(
            "No pending Spotify setlist was found. Load a setlist, then Match with Spotify again.",
          );
          setActiveStep("load");
          return;
        }

        try {
          const parsed = parseSetlistUrl(pending.setlistUrl);
          const setlist = await fetchSetlistById(pending.setlistId);
          if (cancelled) {
            return;
          }

          const status = await getSpotifyAuthorizationStatus().catch(() => null);
          if (!status?.connected) {
            clearSpotifyAuthQueryParams();
            setDestination("spotify");
            setIsSpotifyAuthorized(false);
            setSetlistUrl(pending.setlistUrl);
            setMatchErrorMessage(
              "Connect Spotify from the access page before continuing to match.",
            );
            setActiveStep("load");
            return;
          }

          clearPendingSpotifyMatch();
          clearSpotifyAuthQueryParams();
          setDestination("spotify");
          setIsSpotifyAuthorized(true);
          setSetlistUrl(pending.setlistUrl);
          setParsedSetlist(parsed);
          setFetchedSetlist(setlist);
          setPlaylistName(buildDefaultAppleMusicPlaylistName(setlist));
          setMatchErrorMessage(null);
          setActiveStep("load");
          await runCatalogMatch("spotify", setlist);
        } catch (error) {
          if (cancelled) {
            return;
          }
          clearPendingSpotifyMatch();
          clearSpotifyAuthQueryParams();
          setDestination("spotify");
          setMatchErrorMessage(
            error instanceof Error ? error.message : "Unable to resume Spotify matching.",
          );
          setActiveStep("load");
        }

        return;
      }

      if (authResult === "error") {
        clearPendingSpotifyMatch();
        clearSpotifyAuthQueryParams();
        setDestination("spotify");
        setMatchErrorMessage(authError || "Spotify authorization was denied.");
        setIsSpotifyAuthorized(false);

        if (!pending) {
          return;
        }

        setSetlistUrl(pending.setlistUrl);
        try {
          const parsed = parseSetlistUrl(pending.setlistUrl);
          setParsedSetlist(parsed);
          const setlist = await fetchSetlistById(pending.setlistId);
          if (cancelled) {
            return;
          }
          setFetchedSetlist(setlist);
          setPlaylistName(buildDefaultAppleMusicPlaylistName(setlist));
          setActiveStep("load");
        } catch (error) {
          if (cancelled) {
            return;
          }
          setMatchErrorMessage(
            error instanceof Error ? error.message : "Unable to restore that setlist.",
          );
          setActiveStep("load");
        }

        return;
      }

      if (authResult !== "success") {
        clearSpotifyAuthQueryParams();
        return;
      }

      // Cookies were set by the callback; keep UI authorized even if setlist resume fails.
      if (!pending) {
        clearSpotifyAuthQueryParams();
        setDestination("spotify");
        setIsSpotifyAuthorized(true);
        setMatchErrorMessage(
          "Connected to Spotify, but the setlist to match was lost. Load it again, then Match with Spotify.",
        );
        setActiveStep("load");
        return;
      }

      try {
        const parsed = parseSetlistUrl(pending.setlistUrl);
        const setlist = await fetchSetlistById(pending.setlistId);
        if (cancelled) {
          return;
        }

        clearPendingSpotifyMatch();
        clearSpotifyAuthQueryParams();
        setDestination("spotify");
        // Confirm cookies are readable on this host before treating auth as connected.
        const status = await getSpotifyAuthorizationStatus().catch(() => null);
        if (!status?.connected) {
          setIsSpotifyAuthorized(false);
          setSetlistUrl(pending.setlistUrl);
          setMatchErrorMessage(
            "Spotify authorization finished, but this page cannot read the session cookies. Use http://127.0.0.1 (not localhost) and connect again.",
          );
          setActiveStep("load");
          setIsMatchingTracks(false);
          setMatchingDestination(null);
          return;
        }
        setIsSpotifyAuthorized(true);
        setSetlistUrl(pending.setlistUrl);
        setParsedSetlist(parsed);
        setFetchedSetlist(setlist);
        setPlaylistName(buildDefaultAppleMusicPlaylistName(setlist));
        setMatchErrorMessage(null);
        setActiveStep("load");
        await runCatalogMatch("spotify", setlist);
      } catch (error) {
        if (cancelled) {
          return;
        }
        clearPendingSpotifyMatch();
        clearSpotifyAuthQueryParams();
        setDestination("spotify");
        setIsSpotifyAuthorized(true);
        setSetlistUrl(pending.setlistUrl);
        setMatchErrorMessage(
          error instanceof Error ? error.message : "Unable to resume Spotify matching.",
        );
        setActiveStep("load");
        setIsMatchingTracks(false);
        setMatchingDestination(null);
      }
    }

    void resumeAfterSpotifyAuth();

    return () => {
      cancelled = true;
    };
  }, []);

  // MusicKit authorize on mobile often does a full-page redirect. Resume matching
  // from the pending intent after Apple returns and the music user token is ready.
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const pending = readPendingAppleMusicMatch();
    if (!pending) {
      return;
    }

    let cancelled = false;

    async function resumeAfterAppleMusicAuth() {
      await Promise.resolve();
      if (cancelled) {
        return;
      }

      let authorized = false;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        authorized = await getAppleMusicAuthorizationStatus().catch(() => false);
        if (authorized || cancelled) {
          break;
        }
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 250);
        });
      }

      if (cancelled || !authorized) {
        return;
      }

      setIsAppleMusicAuthorized(true);
      setDestination("apple-music");
      setIsMatchingTracks(true);
      setMatchingDestination("apple-music");
      setMatchErrorMessage(null);

      try {
        const parsed = parseSetlistUrl(pending.setlistUrl);
        const setlist = await fetchSetlistById(pending.setlistId);
        if (cancelled) {
          return;
        }

        setParsedSetlist(parsed);
        setSetlistUrl(pending.setlistUrl);
        setFetchedSetlist(setlist);
        setPlaylistName(buildDefaultAppleMusicPlaylistName(setlist));
        await runCatalogMatch("apple-music", setlist);
      } catch (error) {
        if (cancelled) {
          return;
        }

        clearPendingAppleMusicMatch();
        setMatchErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to resume Apple Music matching after authorization.",
        );
        setActiveStep("load");
        setIsMatchingTracks(false);
        setMatchingDestination(null);
      }
    }

    void resumeAfterAppleMusicAuth();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLoadSetlist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsFetchingSetlist(true);
    setErrorMessage(null);
    setFetchedSetlist(null);
    setCatalogMatches([]);
    setIncludedReviewKeys(new Set());
    setMatchErrorMessage(null);
    setPlaylistName("");
    setCreatedPlaylist(null);
    setPlaylistErrorMessage(null);

    try {
      const parsed = parseSetlistUrl(setlistUrl);
      setParsedSetlist(parsed);

      const setlist = await fetchSetlistById(parsed.id);
      setFetchedSetlist(setlist);
      setPlaylistName(buildDefaultAppleMusicPlaylistName(setlist));
      focusTargetRef.current = "heading";
      setFocusEpoch((value) => value + 1);
      setActiveStep("load");
    } catch (error) {
      setParsedSetlist(null);
      setErrorMessage(error instanceof Error ? error.message : "Unable to load that setlist.");
      setActiveStep("load");
    } finally {
      setIsFetchingSetlist(false);
    }
  }

  function handleLoadAnotherSetlist() {
    clearPendingAppleMusicMatch();
    clearPendingSpotifyMatch();
    setSetlistUrl("");
    setParsedSetlist(null);
    setErrorMessage(null);
    setFetchedSetlist(null);
    setCatalogMatches([]);
    setIncludedReviewKeys(new Set());
    setMatchErrorMessage(null);
    setPlaylistName("");
    setCreatedPlaylist(null);
    setPlaylistErrorMessage(null);
    focusTargetRef.current = "url";
    setFocusEpoch((value) => value + 1);
    setActiveStep("load");
  }

  function handleAcceptReviewMatch(matchKey: string, segmentTitle?: string) {
    setCatalogMatches((current) => {
      const nextMatches = current.map((songMatch) => {
        if (getSetlistSongMatchKey(songMatch) !== matchKey) {
          return songMatch;
        }

        const selectedMatch = segmentTitle
          ? songMatch.selectedMatches.find(
              (candidate) => candidate.segmentTitle === segmentTitle,
            )
          : songMatch.selectedMatches[0];
        const track = selectedMatch?.match ?? songMatch.match;
        if (!track) {
          return songMatch;
        }

        return applySelectedTrack(songMatch, {
          reason: "Included anyway",
          segmentTitle: segmentTitle ?? selectedMatch?.segmentTitle,
          track,
        });
      });

      const updatedSong = nextMatches.find(
        (songMatch) => getSetlistSongMatchKey(songMatch) === matchKey,
      );
      if (updatedSong) {
        clearReviewKeysForSong(matchKey, updatedSong);
      }

      return nextMatches;
    });
  }

  function clearReviewKeysForSong(matchKey: string, updatedSong: SetlistSongMatch) {
    setIncludedReviewKeys((currentKeys) => {
      const nextKeys = new Set(currentKeys);
      nextKeys.delete(matchKey);
      for (const selectedMatch of updatedSong.selectedMatches) {
        if (selectedMatch.status === "matched") {
          nextKeys.delete(getSelectedMatchReviewKey(updatedSong, selectedMatch));
        }
      }
      return nextKeys;
    });
  }

  function handleSelectAlternate(
    matchKey: string,
    alternativeId: string,
    segmentTitle?: string,
  ) {
    setCatalogMatches((current) => {
      const nextMatches = current.map((songMatch) => {
        if (getSetlistSongMatchKey(songMatch) !== matchKey) {
          return songMatch;
        }

        return selectAlternateTrack(songMatch, {
          alternativeId,
          segmentTitle,
        });
      });

      const updatedSong = nextMatches.find(
        (songMatch) => getSetlistSongMatchKey(songMatch) === matchKey,
      );

      if (updatedSong) {
        clearReviewKeysForSong(matchKey, updatedSong);
      }

      return nextMatches;
    });
  }

  async function handleSearchTracks(query: string) {
    const catalogLabel = getDestinationLabel(destination);
    const searchEndpoint =
      destination === "spotify" ? "/api/spotify/search" : "/api/apple-music/search";
    const response = await fetch(searchEndpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    });
    const responseBody: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        responseBody &&
        typeof responseBody === "object" &&
        "error" in responseBody &&
        typeof responseBody.error === "string"
          ? responseBody.error
          : `Unable to search ${catalogLabel}.`;
      throw new Error(message);
    }

    if (
      !responseBody ||
      typeof responseBody !== "object" ||
      !("tracks" in responseBody) ||
      !Array.isArray(responseBody.tracks)
    ) {
      throw new Error(`Unexpected ${catalogLabel} search response.`);
    }

    return responseBody.tracks as AppleMusicTrackMatch[];
  }

  function handleApplySearchTrack(
    matchKey: string,
    track: AppleMusicTrackMatch,
    segmentTitle?: string,
  ) {
    setCatalogMatches((current) => {
      const nextMatches = current.map((songMatch) => {
        if (getSetlistSongMatchKey(songMatch) !== matchKey) {
          return songMatch;
        }

        return applySelectedTrack(songMatch, {
          reason: "Manual search",
          segmentTitle,
          track,
        });
      });

      const updatedSong = nextMatches.find(
        (songMatch) => getSetlistSongMatchKey(songMatch) === matchKey,
      );

      if (updatedSong) {
        clearReviewKeysForSong(matchKey, updatedSong);
      }

      return nextMatches;
    });
  }

  async function handleCreatePlaylist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedPlaylistName = playlistName.trim();
    const description = "Created from a setlist.fm setlist by Setlist Playlist.";

    if (destination === "spotify") {
      const uris = buildSpotifyPlaylistTrackUris(catalogMatches, {
        includedReviewKeys,
      });

      if (!trimmedPlaylistName || uris.length === 0) {
        return;
      }

      setIsCreatingPlaylist(true);
      setPlaylistErrorMessage(null);
      setCreatedPlaylist(null);

      try {
        const playlist = await createSpotifyPlaylist({
          description,
          name: trimmedPlaylistName,
          uris,
        });
        setCreatedPlaylist(playlist);
        setActiveStep("done");
      } catch (error) {
        setPlaylistErrorMessage(
          error instanceof Error
            ? error.message
            : `Unable to create the ${getDestinationLabel(destination)} playlist.`,
        );
        setActiveStep("done");
      } finally {
        setIsCreatingPlaylist(false);
      }

      return;
    }

    const tracks = buildAppleMusicPlaylistTracks(catalogMatches, {
      includedReviewKeys,
    });

    if (!trimmedPlaylistName || tracks.length === 0) {
      return;
    }

    setIsCreatingPlaylist(true);
    setPlaylistErrorMessage(null);
    setCreatedPlaylist(null);

    try {
      const playlist = await createAppleMusicPlaylist({
        description,
        name: trimmedPlaylistName,
        tracks,
      });
      setCreatedPlaylist(playlist);
      setActiveStep("done");
    } catch (error) {
      setPlaylistErrorMessage(
        error instanceof Error
          ? error.message
          : `Unable to create the ${getDestinationLabel(destination)} playlist.`,
      );
      setActiveStep("done");
    } finally {
      setIsCreatingPlaylist(false);
    }
  }

  function handleTryCreateAgain() {
    setPlaylistErrorMessage(null);
    setCreatedPlaylist(null);
    setActiveStep("create");
  }

  const playlistTracks = buildAppleMusicPlaylistTracks(catalogMatches, {
    includedReviewKeys,
  });
  const reviewMatchCount = catalogMatches.reduce((total, songMatch) => {
    const selectedMatches = songMatch.selectedMatches ?? [];
    const reviewSegments = selectedMatches.filter(
      (selectedMatch) =>
        selectedMatch.status === "needs_review" ||
        (songMatch.status === "needs_review" && selectedMatches.length <= 1),
    );
    if (reviewSegments.length > 0) {
      return total + reviewSegments.length;
    }
    return songMatch.status === "needs_review" ? total + 1 : total;
  }, 0);
  const isDestinationAuthorized =
    destination === "spotify" ? isSpotifyAuthorized : isAppleMusicAuthorized;
  const hasPlaylistResult = Boolean(createdPlaylist || playlistErrorMessage);
  const availableSteps: WorkflowStepId[] = [
    "load",
    ...(catalogMatches.length > 0 ? (["create"] as const) : []),
    ...(hasPlaylistResult ? (["done"] as const) : []),
  ];
  const workflowSteps = [
    {
      id: "load" as const,
      label: "Load setlist",
      summary: fetchedSetlist
        ? `${fetchedSetlist.songs.length} ${fetchedSetlist.songs.length === 1 ? "song" : "songs"}`
        : parsedSetlist
          ? `ID ${parsedSetlist.id}`
          : undefined,
    },
    {
      id: "create" as const,
      label: "Review and create",
      summary:
        catalogMatches.length > 0
          ? `${playlistTracks.length} ${playlistTracks.length === 1 ? "match" : "matches"}`
          : undefined,
    },
    {
      id: "done" as const,
      label: "Done",
      summary: createdPlaylist
        ? "Created"
        : playlistErrorMessage
          ? "Failed"
          : undefined,
    },
  ];

  return (
    <section
      className={styles.workflow}
      id="setlist-workflow"
      aria-label="Setlist playlist workflow"
    >
      <WorkflowStepper
        activeStep={activeStep}
        availableSteps={availableSteps}
        onStepChange={setActiveStep}
        steps={workflowSteps}
      />

      <div className={styles.activePanel}>
        {activeStep === "load" ? (
          <LoadSetlistStep
            errorMessage={errorMessage}
            headingRef={activeHeadingRef}
            inputRef={urlInputRef}
            isLoading={isFetchingSetlist}
            isMatching={isMatchingTracks}
            matchErrorMessage={matchErrorMessage}
            matchProgress={matchProgress}
            matchingDestination={matchingDestination}
            onLoadAnother={handleLoadAnotherSetlist}
            onMatchAppleMusic={() => void handleMatchWithDestination("apple-music")}
            onMatchSpotify={
              isSpotifyDestinationEnabled
                ? () => void handleMatchWithDestination("spotify")
                : undefined
            }
            onSetlistUrlChange={setSetlistUrl}
            onSubmit={handleLoadSetlist}
            setlist={fetchedSetlist}
            setlistUrl={setlistUrl}
          />
        ) : null}

        {activeStep === "create" && catalogMatches.length > 0 ? (
          <ReviewMatchesStep
            destination={destination}
            headingRef={activeHeadingRef}
            isCreatingPlaylist={isCreatingPlaylist}
            isDestinationAuthorized={isDestinationAuthorized}
            matches={catalogMatches}
            onAcceptReviewMatch={handleAcceptReviewMatch}
            onApplySearchTrack={handleApplySearchTrack}
            onCreatePlaylist={handleCreatePlaylist}
            onDestinationAuthorizationChange={
              destination === "spotify" ? setIsSpotifyAuthorized : setIsAppleMusicAuthorized
            }
            onLoadAnother={handleLoadAnotherSetlist}
            onPlaylistNameChange={setPlaylistName}
            onSearchTracks={handleSearchTracks}
            onSelectAlternate={handleSelectAlternate}
            playlistName={playlistName}
            playlistTrackCount={playlistTracks.length}
            reviewMatchCount={reviewMatchCount}
            setlistMeta={
              fetchedSetlist
                ? {
                    artistName: fetchedSetlist.artistName,
                    eventDate: fetchedSetlist.eventDate,
                    songCount: fetchedSetlist.songs.length,
                    venueName: fetchedSetlist.venue?.name,
                  }
                : null
            }
          />
        ) : null}

        {activeStep === "done" && hasPlaylistResult ? (
          <PlaylistResultStep
            createdPlaylist={createdPlaylist}
            destination={destination}
            errorMessage={playlistErrorMessage}
            headingRef={activeHeadingRef}
            onLoadAnother={handleLoadAnotherSetlist}
            onTryAgain={handleTryCreateAgain}
          />
        ) : null}
      </div>
    </section>
  );
}
