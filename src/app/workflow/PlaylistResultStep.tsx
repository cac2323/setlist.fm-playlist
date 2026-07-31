import { Ref } from "react";

import {
  getDestinationLabel,
  PlaylistDestination,
} from "@/lib/playlistDestination";

import styles from "../page.module.css";

type PlaylistResultStepProps = {
  createdPlaylist: {
    id: string;
    name: string;
    trackCount: number;
    url?: string;
  } | null;
  destination: PlaylistDestination;
  errorMessage: string | null;
  headingRef: Ref<HTMLHeadingElement>;
  onLoadAnother: () => void;
  onTryAgain: () => void;
};

export function PlaylistResultStep({
  createdPlaylist,
  destination,
  errorMessage,
  headingRef,
  onLoadAnother,
  onTryAgain,
}: PlaylistResultStepProps) {
  const destinationLabel = getDestinationLabel(destination);
  const isSuccess = Boolean(createdPlaylist);

  return (
    <section aria-labelledby="playlist-result-heading">
      <div className={styles.stepHeader}>
        <p className={styles.eyebrow}>Step 3 of 3</p>
        <h2 id="playlist-result-heading" ref={headingRef} tabIndex={-1}>
          {isSuccess ? "Playlist created" : "Playlist not created"}
        </h2>
        <p>
          {isSuccess
            ? `Your ${destinationLabel} playlist is ready.`
            : `Something went wrong creating your ${destinationLabel} playlist.`}
        </p>
      </div>

      {isSuccess && createdPlaylist ? (
        <div className={styles.playlistSuccess} aria-live="polite">
          <strong>{createdPlaylist.name} was created</strong>
          <p>
            Added {createdPlaylist.trackCount}{" "}
            {createdPlaylist.trackCount === 1 ? "track" : "tracks"} to your{" "}
            {destinationLabel} library.
            {createdPlaylist.url ? (
              <>
                {" "}
                <a href={createdPlaylist.url} rel="noreferrer" target="_blank">
                  Open playlist
                </a>
              </>
            ) : null}
          </p>
        </div>
      ) : null}

      {!isSuccess && errorMessage ? (
        <p className={styles.error} role="alert">
          {errorMessage}
        </p>
      ) : null}

      <div className={styles.stickyAction}>
        {isSuccess ? (
          <button className={styles.primaryButton} type="button" onClick={onLoadAnother}>
            Load another setlist
          </button>
        ) : (
          <>
            <button className={styles.primaryButton} type="button" onClick={onTryAgain}>
              Try again
            </button>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={onLoadAnother}
            >
              Load another setlist
            </button>
          </>
        )}
      </div>
    </section>
  );
}
