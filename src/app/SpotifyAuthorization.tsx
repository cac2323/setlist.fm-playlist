"use client";

import { useEffect, useState } from "react";

import {
  beginSpotifyAuthorization,
  getSpotifyAuthorizationStatus,
  unauthorizeSpotify,
} from "@/lib/spotifyAuthClient";

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
    : "Spotify authorization was not completed.";
}

type SpotifyAuthorizationProps = {
  compact?: boolean;
  onAuthorizationChange?: (isAuthorized: boolean) => void;
};

export function SpotifyAuthorization({
  compact = false,
  onAuthorizationChange,
}: SpotifyAuthorizationProps) {
  const [status, setStatus] = useState<AuthorizationStatus>("checking");
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    void getSpotifyAuthorizationStatus()
      .then((result) => {
        if (!isActive) {
          return;
        }

        setStatus(result.connected ? "connected" : "disconnected");
        setDisplayName(result.displayName ?? null);
        onAuthorizationChange?.(result.connected);
      })
      .catch((error: unknown) => {
        if (!isActive) {
          return;
        }

        setStatus("disconnected");
        setDisplayName(null);
        setErrorMessage(getAuthorizationErrorMessage(error));
        onAuthorizationChange?.(false);
      });

    return () => {
      isActive = false;
    };
  }, [onAuthorizationChange]);

  function handleConnect() {
    setStatus("connecting");
    setErrorMessage(null);
    beginSpotifyAuthorization();
  }

  async function handleDisconnect() {
    setStatus("disconnecting");
    setErrorMessage(null);

    try {
      await unauthorizeSpotify();
      setStatus("disconnected");
      setDisplayName(null);
      onAuthorizationChange?.(false);
    } catch (error) {
      setStatus("connected");
      setErrorMessage(getAuthorizationErrorMessage(error));
    }
  }

  const isBusy = status === "checking" || status === "connecting" || status === "disconnecting";

  return (
    <section
      className={`${styles.authorizationCard} ${compact ? styles.authorizationCompact : ""}`}
      aria-labelledby="spotify-auth-heading"
    >
      <div>
        <p className={styles.eyebrow}>Spotify access</p>
        {compact ? (
          <h3 id="spotify-auth-heading">Spotify connection</h3>
        ) : (
          <>
            <h2 id="spotify-auth-heading">Connect your Spotify account</h2>
            <p>
              Spotify matching is invite-only (development-mode allowlist). Authorization
              grants playlist access for approved accounts. Tokens are stored in secure
              httpOnly cookies for up to about 30 days, or until you disconnect.
            </p>
          </>
        )}
      </div>

      <div className={styles.authorizationActions}>
        <p className={styles.authorizationStatus} aria-live="polite">
          {status === "connected"
            ? displayName
              ? `Spotify connected as ${displayName}`
              : "Spotify connected"
            : status === "checking"
              ? "Checking Spotify connection..."
              : status === "connecting"
                ? "Redirecting to Spotify..."
                : status === "disconnecting"
                  ? "Disconnecting Spotify..."
                  : "Spotify not connected"}
        </p>

        {status === "connected" || status === "disconnecting" ? (
          <button
            className={styles.secondaryButton}
            disabled={isBusy}
            type="button"
            onClick={() => void handleDisconnect()}
          >
            {status === "disconnecting" ? "Disconnecting..." : "Disconnect Spotify"}
          </button>
        ) : (
          <button
            className={styles.secondaryButton}
            disabled={isBusy}
            type="button"
            onClick={handleConnect}
          >
            {status === "connecting" ? "Connecting..." : "Connect Spotify"}
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
