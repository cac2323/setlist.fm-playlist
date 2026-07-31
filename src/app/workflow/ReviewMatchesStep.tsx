import { FormEvent, Ref, useState } from "react";

import type {
  AppleMusicTrackMatch,
  SelectedAppleMusicTrack,
  SetlistSongMatch,
} from "@/lib/appleMusic";
import {
  getSetlistSongMatchKey,
} from "@/lib/appleMusicShared";
import {
  countMatchStatuses,
  filterMatchesByStatus,
  getDefaultMatchStatusFilter,
  getEmptyMatchFilterMessage,
  resolveActiveStatusFilter,
  shouldKeepStatusFilterTab,
  type MatchStatusFilter,
} from "@/lib/matchStatusFilter";
import {
  getDestinationLabel,
  PlaylistDestination,
} from "@/lib/playlistDestination";

import { AppleMusicAuthorization } from "../AppleMusicAuthorization";
import { SpotifyAuthorization } from "../SpotifyAuthorization";
import styles from "../page.module.css";
import { ManualTrackSearch } from "./ManualTrackSearch";

const FILTER_TABS: Array<{ id: MatchStatusFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "matched", label: "Matched" },
  { id: "needs_review", label: "Needs review" },
  { id: "unmatched", label: "Unmatched" },
];

type ReviewMatchesStepProps = {
  destination: PlaylistDestination;
  headingRef: Ref<HTMLHeadingElement>;
  isDestinationAuthorized: boolean;
  isCreatingPlaylist: boolean;
  matches: SetlistSongMatch[];
  onAcceptReviewMatch?: (matchKey: string, segmentTitle?: string) => void;
  onApplySearchTrack?: (
    matchKey: string,
    track: AppleMusicTrackMatch,
    segmentTitle?: string,
  ) => void;
  onCreatePlaylist: (event: FormEvent<HTMLFormElement>) => void;
  onDestinationAuthorizationChange: (isAuthorized: boolean) => void;
  onLoadAnother: () => void;
  onPlaylistNameChange: (value: string) => void;
  onSearchTracks?: (query: string) => Promise<AppleMusicTrackMatch[]>;
  onSelectAlternate?: (
    matchKey: string,
    alternativeId: string,
    segmentTitle?: string,
  ) => void;
  playlistName: string;
  playlistTrackCount: number;
  reviewMatchCount: number;
  setlistMeta?: {
    artistName: string;
    eventDate?: string;
    songCount: number;
    venueName?: string;
  } | null;
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

function getSearchPanelKey(matchKey: string, segmentTitle?: string) {
  return segmentTitle ? `${matchKey}::${segmentTitle}` : matchKey;
}

type MatchRepairActionsProps = {
  canSearch: boolean;
  catalogLabel: string;
  onIncludeAnyway?: () => void;
  isSearchOpen: boolean;
  onApply?: (track: AppleMusicTrackMatch) => void;
  onSearch?: (query: string) => Promise<AppleMusicTrackMatch[]>;
  onToggleSearch: () => void;
};

function MatchRepairActions({
  canSearch,
  catalogLabel,
  onIncludeAnyway,
  isSearchOpen,
  onApply,
  onSearch,
  onToggleSearch,
}: MatchRepairActionsProps) {
  return (
    <div className={styles.matchRepairActions}>
      <div className={styles.matchRepairButtons}>
        {onIncludeAnyway ? (
          <button className={styles.secondaryButton} type="button" onClick={onIncludeAnyway}>
            Include anyway
          </button>
        ) : null}
        {canSearch ? (
          <button
            aria-expanded={isSearchOpen}
            className={styles.secondaryButton}
            type="button"
            onClick={onToggleSearch}
          >
            {isSearchOpen ? "Hide search" : "Find a match"}
          </button>
        ) : null}
      </div>
      {canSearch && isSearchOpen && onSearch && onApply ? (
        <ManualTrackSearch
          autoFocus
          catalogLabel={catalogLabel}
          onApply={onApply}
          onSearch={onSearch}
        />
      ) : null}
    </div>
  );
}

export function ReviewMatchesStep({
  destination,
  headingRef,
  isDestinationAuthorized,
  isCreatingPlaylist,
  matches,
  onAcceptReviewMatch,
  onApplySearchTrack,
  onCreatePlaylist,
  onDestinationAuthorizationChange,
  onLoadAnother,
  onPlaylistNameChange,
  onSearchTracks,
  onSelectAlternate,
  playlistName,
  playlistTrackCount,
  reviewMatchCount,
  setlistMeta = null,
}: ReviewMatchesStepProps) {
  const destinationLabel = getDestinationLabel(destination);
  const canManualSearch = Boolean(onSearchTracks && onApplySearchTrack);
  const statusCounts = countMatchStatuses(matches);
  const [activeFilter, setActiveFilter] = useState<MatchStatusFilter>(() =>
    getDefaultMatchStatusFilter(statusCounts),
  );
  const [openSearchKeys, setOpenSearchKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [retainedFilterKeys, setRetainedFilterKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [retainedForFilter, setRetainedForFilter] = useState<MatchStatusFilter | null>(null);
  const resolvedFilter = resolveActiveStatusFilter(
    activeFilter,
    statusCounts,
    retainedForFilter,
    retainedFilterKeys.size,
  );
  const activeRetainKeys =
    retainedForFilter === resolvedFilter ? retainedFilterKeys : new Set<string>();
  const filteredMatches = filterMatchesByStatus(matches, resolvedFilter, activeRetainKeys);
  const visibleTabs = FILTER_TABS.filter((tab) =>
    shouldKeepStatusFilterTab(
      tab.id,
      statusCounts,
      retainedForFilter,
      retainedFilterKeys.size,
    ),
  );

  function toggleSearchPanel(panelKey: string) {
    setOpenSearchKeys((current) => {
      const next = new Set(current);
      if (next.has(panelKey)) {
        next.delete(panelKey);
      } else {
        next.add(panelKey);
      }
      return next;
    });
  }

  function selectStatusFilter(filter: MatchStatusFilter) {
    setActiveFilter(filter);
    setRetainedFilterKeys(new Set());
    setRetainedForFilter(null);
  }

  function retainMatchAfterRepair(matchKey: string) {
    if (resolvedFilter !== "needs_review" && resolvedFilter !== "unmatched") {
      return;
    }

    setRetainedForFilter(resolvedFilter);
    setRetainedFilterKeys((current) => {
      const next = new Set(current);
      next.add(matchKey);
      return next;
    });
    setOpenSearchKeys((current) => {
      const next = new Set(current);
      for (const key of current) {
        if (key === matchKey || key.startsWith(`${matchKey}::`)) {
          next.delete(key);
        }
      }
      return next;
    });
  }

  function acceptReviewMatch(matchKey: string, segmentTitle?: string) {
    retainMatchAfterRepair(matchKey);
    onAcceptReviewMatch?.(matchKey, segmentTitle);
  }

  function applySearchTrack(
    matchKey: string,
    track: AppleMusicTrackMatch,
    segmentTitle?: string,
  ) {
    retainMatchAfterRepair(matchKey);
    onApplySearchTrack?.(matchKey, track, segmentTitle);
  }

  return (
    <section aria-labelledby="review-matches-heading">
      <div className={styles.stepHeader}>
        <p className={styles.eyebrow}>Step 2 of 3</p>
        <h2 id="review-matches-heading" ref={headingRef} tabIndex={-1}>
          Review and create
        </h2>
        {setlistMeta ? (
          <p>
            {[
              setlistMeta.artistName,
              setlistMeta.venueName,
              setlistMeta.eventDate,
              setlistMeta.songCount > 0
                ? `${setlistMeta.songCount} ${setlistMeta.songCount === 1 ? "song" : "songs"}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : null}
        <p>
          {playlistTrackCount} matched{" "}
          {playlistTrackCount === 1 ? "track" : "tracks"} will be added in setlist
          order. Needs-review placeholders are skipped unless you add them.
          Unmatched songs and consecutive duplicate tracks are skipped.
          {reviewMatchCount > 0
            ? ` ${reviewMatchCount} ${reviewMatchCount === 1 ? "item needs" : "items need"} review.`
            : ""}
        </p>
      </div>

      <div
        aria-label="Filter matches by status"
        className={styles.matchStatusFilters}
        role="group"
      >
        {visibleTabs.map((tab) => {
          const count = statusCounts[tab.id];
          const isActive = resolvedFilter === tab.id;

          return (
            <button
              aria-pressed={isActive}
              className={isActive ? styles.matchStatusFilterActive : undefined}
              key={tab.id}
              type="button"
              onClick={() => selectStatusFilter(tab.id)}
            >
              {tab.label} <span>{count}</span>
            </button>
          );
        })}
      </div>

      <div
        className={styles.reviewRegion}
        aria-label={`Proposed ${destinationLabel} matches`}
        role="region"
        tabIndex={0}
      >
        {filteredMatches.length === 0 ? (
          <p className={styles.matchStatusEmpty}>
            {getEmptyMatchFilterMessage(resolvedFilter)}
          </p>
        ) : (
        <ol className={styles.matchList}>
          {filteredMatches.map((songMatch) => {
            const matchKey = getSetlistSongMatchKey(songMatch);
            const selectedMatches = songMatch.selectedMatches ?? [];
            const isRetainedMatch = activeRetainKeys.has(matchKey);
            const hasReviewSegments =
              songMatch.status === "needs_review" ||
              selectedMatches.some((selectedMatch) =>
                selectedMatchNeedsReview(songMatch, selectedMatch),
              );
            const showSelectedMatches =
              selectedMatches.length > 1 ||
              selectedMatches.some((selectedMatch) =>
                selectedMatchNeedsReview(songMatch, selectedMatch),
              );

            return (
              <li
                className={hasReviewSegments ? styles.needsReviewMatch : undefined}
                key={matchKey}
              >
                <div>
                  <span>{songMatch.setlistSong.position}</span>
                  <strong>{songMatch.setlistSong.name}</strong>
                  <p>{songMatch.query}</p>
                  {hasReviewSegments ? (
                    <p className={styles.needsReviewBadge}>Needs review</p>
                  ) : isRetainedMatch ? (
                    <p className={styles.updatedMatchBadge}>Updated</p>
                  ) : null}
                </div>
                <div>
                  {showSelectedMatches && selectedMatches.length > 0 ? (
                    <div className={styles.selectedMatches}>
                      <strong>Selected tracks</strong>
                      <ol>
                        {selectedMatches.map((selectedMatch) => {
                          const isReviewSegment = selectedMatchNeedsReview(
                            songMatch,
                            selectedMatch,
                          );
                          const usedTrackIds = new Set(
                            selectedMatches
                              .filter(
                                (candidate) =>
                                  candidate.segmentTitle !== selectedMatch.segmentTitle,
                              )
                              .map((candidate) => candidate.match.id),
                          );
                          const segmentAlternatives = songMatch.alternatives.filter(
                            (alternative) => !usedTrackIds.has(alternative.id),
                          );

                          const segmentSearchKey = getSearchPanelKey(
                            matchKey,
                            selectedMatch.segmentTitle,
                          );

                          return (
                            <li
                              className={
                                isReviewSegment ? styles.selectedMatchNeedsReview : undefined
                              }
                              key={`${selectedMatch.segmentTitle}-${selectedMatch.match.id}`}
                            >
                              <p>{selectedMatch.segmentTitle}</p>
                              <strong>{selectedMatch.match.name}</strong>
                              <p>
                                {selectedMatch.match.artistName}
                                {selectedMatch.match.albumName
                                  ? ` · ${selectedMatch.match.albumName}`
                                  : ""}
                              </p>
                              {isReviewSegment ? (
                                <p>Artist may be wrong.</p>
                              ) : (
                                <p>{Math.round(selectedMatch.confidence * 100)}% confidence</p>
                              )}
                              {isReviewSegment || (isRetainedMatch && canManualSearch) ? (
                                <MatchRepairActions
                                  canSearch={canManualSearch}
                                  catalogLabel={destinationLabel}
                                  isSearchOpen={openSearchKeys.has(segmentSearchKey)}
                                  onIncludeAnyway={
                                    isReviewSegment && onAcceptReviewMatch
                                      ? () =>
                                          acceptReviewMatch(
                                            matchKey,
                                            selectedMatch.segmentTitle,
                                          )
                                      : undefined
                                  }
                                  onApply={
                                    onApplySearchTrack
                                      ? (track) =>
                                          applySearchTrack(
                                            matchKey,
                                            track,
                                            selectedMatch.segmentTitle,
                                          )
                                      : undefined
                                  }
                                  onSearch={onSearchTracks}
                                  onToggleSearch={() => toggleSearchPanel(segmentSearchKey)}
                                />
                              ) : null}
                              {selectedMatches.length > 1 &&
                              segmentAlternatives.length > 0 &&
                              onSelectAlternate ? (
                                <details className={styles.alternatives}>
                                  <summary>Alternatives for {selectedMatch.segmentTitle}</summary>
                                  <ul>
                                    {segmentAlternatives.slice(0, 3).map((alternative) => (
                                      <li key={alternative.id}>
                                        <span>
                                          {alternative.name} by {alternative.artistName} (
                                          {Math.round(alternative.confidence * 100)}%)
                                        </span>
                                        <button
                                          className={styles.textButton}
                                          type="button"
                                          onClick={() =>
                                            onSelectAlternate(
                                              matchKey,
                                              alternative.id,
                                              selectedMatch.segmentTitle,
                                            )
                                          }
                                        >
                                          Use this match
                                        </button>
                                      </li>
                                    ))}
                                  </ul>
                                </details>
                              ) : null}
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  ) : songMatch.match ? (
                    <>
                      <strong>{songMatch.match.name}</strong>
                      <p>
                        {songMatch.match.artistName}
                        {songMatch.match.albumName ? ` · ${songMatch.match.albumName}` : ""}
                      </p>
                      {songMatch.status !== "needs_review" ? (
                        <p>{Math.round(songMatch.confidence * 100)}% confidence</p>
                      ) : (
                        <p>Artist may be wrong.</p>
                      )}
                      {songMatch.status === "needs_review" ||
                      (isRetainedMatch && canManualSearch) ? (
                        <MatchRepairActions
                          canSearch={canManualSearch}
                          catalogLabel={destinationLabel}
                          isSearchOpen={openSearchKeys.has(matchKey)}
                          onIncludeAnyway={
                            songMatch.status === "needs_review" && onAcceptReviewMatch
                              ? () =>
                                  acceptReviewMatch(
                                    matchKey,
                                    selectedMatches[0]?.segmentTitle,
                                  )
                              : undefined
                          }
                          onApply={
                            onApplySearchTrack
                              ? (track) => applySearchTrack(matchKey, track)
                              : undefined
                          }
                          onSearch={onSearchTracks}
                          onToggleSearch={() => toggleSearchPanel(matchKey)}
                        />
                      ) : null}
                    </>
                  ) : (
                    <>
                      <strong>No match</strong>
                      <p>Search {destinationLabel} to add this song.</p>
                      {canManualSearch ? (
                        <MatchRepairActions
                          canSearch
                          catalogLabel={destinationLabel}
                          isSearchOpen={openSearchKeys.has(matchKey)}
                          onApply={
                            onApplySearchTrack
                              ? (track) => applySearchTrack(matchKey, track)
                              : undefined
                          }
                          onSearch={onSearchTracks}
                          onToggleSearch={() => toggleSearchPanel(matchKey)}
                        />
                      ) : null}
                    </>
                  )}
                  {songMatch.reasons.length > 0 ? (
                    <ul className={styles.reasonList}>
                      {songMatch.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  ) : null}
                  {songMatch.alternatives.length > 0 && selectedMatches.length <= 1 ? (
                    <details className={styles.alternatives}>
                      <summary>Alternatives</summary>
                      <ul>
                        {songMatch.alternatives.slice(0, 3).map((alternative) => (
                          <li key={alternative.id}>
                            <span>
                              {alternative.name} by {alternative.artistName} (
                              {Math.round(alternative.confidence * 100)}%)
                            </span>
                            {onSelectAlternate ? (
                              <button
                                className={styles.textButton}
                                type="button"
                                onClick={() =>
                                  onSelectAlternate(
                                    matchKey,
                                    alternative.id,
                                    selectedMatches[0]?.segmentTitle,
                                  )
                                }
                              >
                                Use this match
                              </button>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
        )}
      </div>

      <div className={styles.createDock}>
        {destination === "spotify" ? (
          <SpotifyAuthorization
            compact
            onAuthorizationChange={onDestinationAuthorizationChange}
          />
        ) : (
          <AppleMusicAuthorization compact />
        )}

        <form className={styles.form} onSubmit={onCreatePlaylist}>
          <label htmlFor="playlist-name">Playlist name</label>
          <input
            id="playlist-name"
            maxLength={100}
            required
            type="text"
            value={playlistName}
            onChange={(event) => onPlaylistNameChange(event.target.value)}
          />
          <button
            disabled={
              !isDestinationAuthorized ||
              isCreatingPlaylist ||
              playlistName.trim().length === 0 ||
              playlistTrackCount === 0
            }
            type="submit"
          >
            {isCreatingPlaylist
              ? "Creating playlist..."
              : `Create ${destinationLabel} playlist`}
          </button>
        </form>

        {!isDestinationAuthorized ? (
          <p>
            Connection to {destinationLabel} was lost. Connect again to create the
            playlist.
          </p>
        ) : (
          <p>{destinationLabel} is connected. Review matches, then create your playlist.</p>
        )}

        <button
          className={styles.secondaryButton}
          disabled={isCreatingPlaylist}
          type="button"
          onClick={onLoadAnother}
        >
          Load another setlist
        </button>
      </div>
    </section>
  );
}
