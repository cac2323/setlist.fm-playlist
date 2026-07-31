import Link from "next/link";

import styles from "./page.module.css";

export function SiteFooter() {
  return (
    <footer className={styles.siteFooter}>
      <p>
        Setlist Playlist uses setlist.fm data and creates playlists in your Apple
        Music or Spotify library. This app does not create its own user accounts.
      </p>
      <nav aria-label="Legal">
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/">Home</Link>
      </nav>
    </footer>
  );
}
