import type { Metadata } from "next";
import Link from "next/link";

import styles from "../page.module.css";

export const metadata: Metadata = {
  title: "Terms · Setlist Playlist",
  description: "Terms of use for Setlist Playlist.",
};

export default function TermsPage() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <article className={styles.legalDoc}>
          <p className={styles.eyebrow}>Legal</p>
          <h1>Terms</h1>
          <p className={styles.legalLead}>
            By using Setlist Playlist, you agree to these terms.
          </p>

          <h2>Service</h2>
          <p>
            Setlist Playlist helps you load a public setlist.fm show, match songs to
            Apple Music or Spotify, and create a playlist in a music service you
            authorize. The app is provided as-is, without warranties of any kind.
          </p>

          <h2>Your responsibilities</h2>
          <ul>
            <li>Use only setlist URLs and content you are allowed to access.</li>
            <li>
              Comply with setlist.fm, Apple, and Spotify terms when using their APIs
              and accounts.
            </li>
            <li>
              Do not abuse the app (for example automated scraping or quota abuse).
            </li>
          </ul>

          <h2>Third-party services</h2>
          <p>
            Playlist matching and creation depend on third-party APIs. Availability,
            catalog coverage, and account requirements (such as Spotify Premium in
            some developer modes) are outside this app’s control.
          </p>

          <h2>No account on this site</h2>
          <p>
            This app does not provide its own user accounts. Access to your music
            library is granted through Apple Music or Spotify authorization and can
            be revoked by disconnecting in the app or in those services’ settings.
          </p>

          <h2>Limitation of liability</h2>
          <p>
            To the fullest extent permitted by law, the operators of this app are not
            liable for indirect, incidental, or consequential damages arising from
            use of the tool, including failed matches, missing tracks, or API outages.
          </p>

          <h2>Changes</h2>
          <p>
            These terms may be updated as the project evolves. Continued use after
            changes means you accept the updated terms.
          </p>

          <h2>Contact</h2>
          <p>
            Questions about these terms:{" "}
            <a href="mailto:cac2323@columbia.edu">cac2323@columbia.edu</a>.
          </p>

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
