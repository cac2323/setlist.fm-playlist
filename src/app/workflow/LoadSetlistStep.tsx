import { FormEvent, Ref } from "react";

import type { MatchProgress } from "@/lib/matchSongsWithProgress";
import {
  isSpotifyDestinationEnabled,
  PlaylistDestination,
} from "@/lib/playlistDestination";
import type { NormalizedSetlist } from "@/lib/setlistfm";

import styles from "../page.module.css";

const EXAMPLE_SETLIST_URL =
  "https://www.setlist.fm/setlist/jayz/2026/yankee-stadium-the-bronx-ny-3b497c60.html";

type LoadSetlistStepProps = {
  errorMessage: string | null;
  headingRef: Ref<HTMLHeadingElement>;
  inputRef: Ref<HTMLInputElement>;
  isLoading: boolean;
  isMatching?: boolean;
  matchErrorMessage?: string | null;
  matchProgress?: MatchProgress | null;
  matchingDestination?: PlaylistDestination | null;
  onLoadAnother?: () => void;
  onMatchAppleMusic?: () => void;
  onMatchSpotify?: () => void;
  onSetlistUrlChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  setlist?: NormalizedSetlist | null;
  setlistUrl: string;
};

function matchButtonLabel(
  destination: PlaylistDestination,
  isMatching: boolean,
  matchingDestination: PlaylistDestination | null,
  matchProgress?: MatchProgress | null,
) {
  if (!isMatching || matchingDestination !== destination) {
    if (!isSpotifyDestinationEnabled && destination === "apple-music") {
      return "Find matches";
    }
    return destination === "spotify" ? "Match with Spotify" : "Match with Apple Music";
  }

  if (matchProgress && matchProgress.total > 0) {
    return `Finding matches… ${matchProgress.completed} of ${matchProgress.total}`;
  }

  return "Finding matches…";
}

export function LoadSetlistStep({
  errorMessage,
  headingRef,
  inputRef,
  isLoading,
  isMatching = false,
  matchErrorMessage = null,
  matchProgress = null,
  matchingDestination = null,
  onLoadAnother,
  onMatchAppleMusic,
  onMatchSpotify,
  onSetlistUrlChange,
  onSubmit,
  setlist = null,
  setlistUrl,
}: LoadSetlistStepProps) {
  const hasSetlist = Boolean(setlist);

  return (
    <section aria-labelledby="load-setlist-heading">
      <div className={styles.stepHeader}>
        <p className={styles.eyebrow}>Step 1 of 3</p>
        <h2 id="load-setlist-heading" ref={headingRef} tabIndex={-1}>
          {hasSetlist && setlist ? `Loaded ${setlist.artistName}` : "Load a setlist"}
        </h2>
        {hasSetlist && setlist ? (
          <>
            <p>
              {[
                setlist.venue?.name,
                setlist.eventDate,
                setlist.songs.length > 0
                  ? `${setlist.songs.length} ${setlist.songs.length === 1 ? "song" : "songs"}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p>
              {isSpotifyDestinationEnabled
                ? "Choose a streaming service to authorize (if needed) and find matches."
                : "Connect Apple Music if prompted, then find matches."}
            </p>
          </>
        ) : (
          <p>Paste a setlist.fm page and we’ll load its songs in one step.</p>
        )}
      </div>

      {!hasSetlist ? (
        <form
          className={styles.form}
          action="#setlist-workflow"
          method="get"
          onSubmit={onSubmit}
        >
          <label htmlFor="setlist-url">Setlist URL</label>
          <input
            id="setlist-url"
            name="setlist-url"
            placeholder={EXAMPLE_SETLIST_URL}
            ref={inputRef}
            required
            type="url"
            value={setlistUrl}
            onChange={(event) => onSetlistUrlChange(event.target.value)}
          />
          <button
            disabled={isLoading}
            name="fetch-setlist"
            type="submit"
            value="1"
          >
            {isLoading ? "Loading setlist..." : "Load setlist"}
          </button>
        </form>
      ) : null}

      {errorMessage ? (
        <p className={styles.error} role="alert">
          {errorMessage}
        </p>
      ) : null}

      {hasSetlist && setlist ? (
        <>
          {setlist.songs.length > 0 ? (
            <div
              className={styles.reviewRegion}
              aria-label={`${setlist.artistName} setlist songs`}
              role="region"
              tabIndex={0}
            >
              <ol className={styles.songList}>
                {setlist.songs.map((song) => (
                  <li key={`${song.position}-${song.name}`}>
                    <span>{song.position}</span>
                    <div>
                      <strong>{song.name}</strong>
                      {song.coverArtistName ? <p>Cover: {song.coverArtistName}</p> : null}
                      {song.info ? <p>{song.info}</p> : null}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <p>No songs were listed for this setlist.</p>
          )}

          {matchErrorMessage ? (
            <p className={styles.error} role="alert">
              {matchErrorMessage}
            </p>
          ) : null}

          {isMatching && matchProgress && matchProgress.total > 0 ? (
            <div
              aria-live="polite"
              className={styles.matchProgress}
              role="status"
            >
              <div className={styles.matchProgressTrack}>
                <div
                  className={styles.matchProgressFill}
                  style={{
                    width: `${Math.round((matchProgress.completed / matchProgress.total) * 100)}%`,
                  }}
                />
              </div>
              <p>
                Finding matches… {matchProgress.completed} of {matchProgress.total}
              </p>
            </div>
          ) : null}

          <div className={styles.stickyAction}>
            <button
              className={styles.secondaryButton}
              disabled={isMatching}
              type="button"
              onClick={onLoadAnother}
            >
              Load another setlist
            </button>
            {setlist.songs.length > 0 && onMatchAppleMusic ? (
              <div className={styles.matchActions}>
                <button
                  className={styles.primaryButton}
                  disabled={isMatching}
                  type="button"
                  onClick={onMatchAppleMusic}
                >
                  {matchButtonLabel(
                    "apple-music",
                    isMatching,
                    matchingDestination,
                    matchProgress,
                  )}
                </button>
                {isSpotifyDestinationEnabled && onMatchSpotify ? (
                  <button
                    className={styles.primaryButton}
                    disabled={isMatching}
                    type="button"
                    onClick={onMatchSpotify}
                  >
                    {matchButtonLabel(
                      "spotify",
                      isMatching,
                      matchingDestination,
                      matchProgress,
                    )}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
