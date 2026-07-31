"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { readPendingSpotifyMatch } from "@/lib/pendingSpotifyMatch";
import { navigateTo } from "@/lib/browserNavigation";
import {
  beginSpotifyAuthorization,
  getSpotifyAuthorizationStatus,
} from "@/lib/spotifyAuthClient";

import styles from "../page.module.css";

/**
 * Increment 1: explain invite-only Spotify + Connect / continue matching.
 * Email waitlist form lands in Increment 2.
 */
export function SpotifyAccessActions() {
  const [isSpotifyConnected, setIsSpotifyConnected] = useState(false);
  const [hasPendingMatch, setHasPendingMatch] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    setHasPendingMatch(Boolean(readPendingSpotifyMatch()));

    void getSpotifyAuthorizationStatus()
      .then((status) => setIsSpotifyConnected(status.connected))
      .catch(() => setIsSpotifyConnected(false));
  }, []);

  function handleConnect() {
    setIsConnecting(true);
    beginSpotifyAuthorization();
  }

  function handleContinueMatching() {
    navigateTo("/?spotify_match=1#setlist-workflow");
  }

  return (
    <div className={styles.spotifyAccessActions}>
      <div className={styles.spotifyAccessApproved}>
        <p>
          Already on the allowlist? Connect Spotify
          {hasPendingMatch ? ", then we’ll resume matching your setlist." : "."}
        </p>
        {isSpotifyConnected && hasPendingMatch ? (
          <button
            className={styles.primaryButton}
            type="button"
            onClick={handleContinueMatching}
          >
            Continue matching
          </button>
        ) : (
          <button
            className={styles.secondaryButton}
            disabled={isConnecting}
            type="button"
            onClick={handleConnect}
          >
            {isConnecting ? "Redirecting to Spotify…" : "Connect Spotify"}
          </button>
        )}
      </div>

      <p>
        Prefer the public path?{" "}
        <Link href="/">Match with Apple Music instead</Link>.
      </p>
    </div>
  );
}
