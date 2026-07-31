"use client";

import { useEffect, useState } from "react";

import {
  authorizeAppleMusic,
  getAppleMusicAuthorizationStatus,
  unauthorizeAppleMusic,
} from "@/lib/appleMusicAuth";

import styles from "./page.module.css";

type AuthorizationStatus =
  | "checking"
  | "connected"
  | "connecting"
  | "disconnected"
  | "disconnecting";

function getAuthorizationErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Apple Music authorization was not completed.";
}

type AppleMusicAuthorizationProps = {
  compact?: boolean;
};

export function AppleMusicAuthorization({ compact = false }: AppleMusicAuthorizationProps) {
  const [status, setStatus] = useState<AuthorizationStatus>("checking");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    void getAppleMusicAuthorizationStatus()
      .then((isAuthorized) => {
        if (isActive) {
          setStatus(isAuthorized ? "connected" : "disconnected");
        }
      })
      .catch((error: unknown) => {
        if (isActive) {
          setStatus("disconnected");
          setErrorMessage(getAuthorizationErrorMessage(error));
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  async function handleConnect() {
    setStatus("connecting");
    setErrorMessage(null);

    try {
      await authorizeAppleMusic();
      setStatus("connected");
    } catch (error) {
      setStatus("disconnected");
      setErrorMessage(getAuthorizationErrorMessage(error));
    }
  }

  async function handleDisconnect() {
    setStatus("disconnecting");
    setErrorMessage(null);

    try {
      await unauthorizeAppleMusic();
      setStatus("disconnected");
    } catch (error) {
      setStatus("connected");
      setErrorMessage(getAuthorizationErrorMessage(error));
    }
  }

  const isBusy = status === "checking" || status === "connecting" || status === "disconnecting";

  return (
    <section
      className={`${styles.authorizationCard} ${compact ? styles.authorizationCompact : ""}`}
      aria-labelledby="apple-music-auth-heading"
    >
      <div>
        <p className={styles.eyebrow}>Apple Music access</p>
        {compact ? (
          <h3 id="apple-music-auth-heading">Apple Music connection</h3>
        ) : (
          <>
            <h2 id="apple-music-auth-heading">Connect your Apple Music account</h2>
            <p>
              Authorization grants this app access to create playlists in your library.
              Your Music User Token stays managed by MusicKit in this browser.
            </p>
          </>
        )}
      </div>

      <div className={styles.authorizationActions}>
        <p className={styles.authorizationStatus} aria-live="polite">
          {status === "connected"
            ? "Apple Music connected"
            : status === "checking"
              ? "Checking Apple Music connection..."
              : status === "connecting"
                ? "Waiting for Apple Music authorization..."
                : status === "disconnecting"
                  ? "Disconnecting Apple Music..."
                  : "Apple Music not connected"}
        </p>

        {status === "connected" || status === "disconnecting" ? (
          <button
            className={styles.secondaryButton}
            disabled={isBusy}
            type="button"
            onClick={() => void handleDisconnect()}
          >
            {status === "disconnecting" ? "Disconnecting..." : "Disconnect Apple Music"}
          </button>
        ) : (
          <button
            className={styles.secondaryButton}
            disabled={isBusy}
            type="button"
            onClick={() => void handleConnect()}
          >
            {status === "connecting" ? "Connecting..." : "Connect Apple Music"}
          </button>
        )}
      </div>

      {errorMessage ? (
        <p className={styles.error} role="alert">
          {errorMessage}
        </p>
      ) : null}
    </section>
  );
}
