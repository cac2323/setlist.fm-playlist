import type { Metadata } from "next";
import Link from "next/link";

import styles from "../page.module.css";
import { SpotifyAccessActions } from "./SpotifyAccessActions";

export const metadata: Metadata = {
  title: "Spotify access · Setlist Playlist",
  description:
    "Spotify matching is invite-only while the app is in Spotify development mode. Use Apple Music for public access.",
};

export default function SpotifyAccessPage() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <article className={styles.legalDoc}>
          <p className={styles.eyebrow}>Spotify</p>
          <h1>Spotify access is invite-only</h1>
          <p className={styles.legalLead}>
            Spotify&apos;s Web API no longer grants unlimited public access to
            individual apps. This project stays in Spotify development mode, so only
            approved tester accounts can connect and create playlists.
          </p>

          <h2>What this means</h2>
          <ul>
            <li>
              Anyone can use <strong>Apple Music</strong> on the home page without an
              invite.
            </li>
            <li>
              <strong>Spotify</strong> works only after your Spotify account email is
              added under User Management in the Spotify Developer Dashboard.
            </li>
            <li>
              If you&apos;re already approved, connect below to continue matching.
            </li>
          </ul>

          <SpotifyAccessActions />

          <p>
            <Link href="/">Back to home</Link>
            {" · "}
            <Link href="/privacy">Privacy</Link>
          </p>
        </article>
      </main>
    </div>
  );
}
