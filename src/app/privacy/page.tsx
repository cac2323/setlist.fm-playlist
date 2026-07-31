import type { Metadata } from "next";
import Link from "next/link";

import styles from "../page.module.css";

export const metadata: Metadata = {
  title: "Privacy · Setlist Playlist",
  description: "How Setlist Playlist handles setlist URLs, music-service auth, and cookies.",
};

export default function PrivacyPage() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <article className={styles.legalDoc}>
          <p className={styles.eyebrow}>Legal</p>
          <h1>Privacy</h1>
          <p className={styles.legalLead}>
            This page explains what Setlist Playlist processes when you turn a
            setlist.fm show into an Apple Music or Spotify playlist.
          </p>

          <h2>What this app is</h2>
          <p>
            Setlist Playlist is a web tool. It does not create its own user accounts,
            and it does not ask you for an email/password for this site.
          </p>

          <h2>Setlist.fm data</h2>
          <p>
            When you paste a setlist.fm URL, the app reads the setlist ID from that
            URL and fetches show metadata and song titles from the setlist.fm API
            using a server-side API key. The URL and setlist contents are processed
            to build matches and playlists for your request.
          </p>

          <h2>Apple Music</h2>
          <p>
            Matching uses Apple Music catalog search via this app’s developer
            credentials. Creating a playlist requires you to authorize Apple Music
            in the browser through MusicKit. Your Music User Token stays in the
            browser under MusicKit’s control; this app uses it to create a private
            playlist in your library when you ask it to.
          </p>

          <h2>Spotify</h2>
          <p>
            Matching may use a signed-in Spotify token when available, or
            application credentials for catalog search. Creating a playlist requires
            Spotify OAuth. After you authorize, this app stores Spotify access and
            refresh tokens in{" "}
            <strong>httpOnly</strong> cookies (SameSite=Lax; Secure in production)
            so playlist creation can run on the server. Refresh tokens are kept for
            up to about <strong>30 days</strong>, or until you disconnect Spotify in
            the app. Access tokens expire sooner and are refreshed as needed.
          </p>
          <p>
            While waiting for Spotify login, the app may store a short-lived
            “pending match” intent in your browser’s{" "}
            <code>sessionStorage</code> so matching can resume after the redirect.
          </p>
          <p>
            Spotify matching is invite-only while the app is in Spotify development
            mode. Public users cannot authorize; only allowlisted tester accounts can
            connect and create playlists. Apple Music remains the open public path.
          </p>

          <h2>What we do not sell</h2>
          <p>
            This app is not designed to sell your personal information. Music-service
            tokens are used only to match tracks and create playlists you request.
          </p>

          <h2>Third parties</h2>
          <p>
            Requests go to setlist.fm, Apple Music, and/or Spotify as needed for the
            features you use. Their privacy policies apply to data those services
            receive.
          </p>

          <h2>Contact</h2>
          <p>
            If you run or fork this project, replace this section with a contact
            method for privacy questions.
          </p>

          <p>
            <Link href="/">Back to home</Link>
            {" · "}
            <Link href="/terms">Terms</Link>
          </p>
        </article>
      </main>
    </div>
  );
}
