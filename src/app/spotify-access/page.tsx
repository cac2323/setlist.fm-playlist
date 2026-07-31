import type { Metadata } from "next";

import styles from "../page.module.css";
import { SpotifyAccessActions } from "./SpotifyAccessActions";

export const metadata: Metadata = {
  title: "Spotify access · Setlist Playlist",
  description:
    "Spotify matching is not available to the public while the app is in Spotify development mode. Use Apple Music instead.",
};

export default function SpotifyAccessPage() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <article className={styles.legalDoc}>
          <h1>Spotify is not available publicly</h1>
          <p className={styles.legalLead}>
            Spotify&apos;s Web API no longer grants unlimited public access to
            individual apps. This project stays in Spotify development mode, so
            matching and playlist creation only work for allowlisted tester
            accounts—not for the general public.
          </p>

          <h2>What this means</h2>
          <ul>
            <li>
              Anyone can use <strong>Apple Music</strong> on the home page without an
              invite.
            </li>
            <li>
              <strong>Spotify</strong> is invite-only. Public users cannot connect or
              create playlists here.
            </li>
            <li>
              If you&apos;re already on the allowlist, connect below to continue
              matching.
            </li>
          </ul>

          <SpotifyAccessActions />
        </article>
      </main>
    </div>
  );
}
