import { SetlistUrlForm } from "./SetlistUrlForm";
import styles from "./page.module.css";
import { matchSetlistSongsToAppleMusic } from "@/lib/appleMusic";
import { fetchSetlistById } from "@/lib/setlistfm";
import { parseSetlistUrl } from "@/lib/setlistUrl";

type HomeProps = {
  searchParams?: Promise<{
    "fetch-setlist"?: string;
    "match-apple-music"?: string;
    "setlist-url"?: string;
  }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const resolvedSearchParams = await searchParams;
  const initialSetlistUrl = resolvedSearchParams?.["setlist-url"] ?? "";
  const shouldMatchAppleMusic = resolvedSearchParams?.["match-apple-music"] === "1";
  const shouldFetchSetlist =
    resolvedSearchParams?.["fetch-setlist"] === "1" || shouldMatchAppleMusic;
  let initialParsedSetlist;
  let initialErrorMessage;
  let initialFetchedSetlist;
  let initialFetchErrorMessage;
  let initialAppleMusicMatches;
  let initialMatchErrorMessage;

  if (initialSetlistUrl) {
    try {
      initialParsedSetlist = parseSetlistUrl(initialSetlistUrl);

      if (shouldFetchSetlist) {
        try {
          initialFetchedSetlist = await fetchSetlistById(initialParsedSetlist.id);

          if (shouldMatchAppleMusic) {
            try {
              initialAppleMusicMatches = await matchSetlistSongsToAppleMusic(
                initialFetchedSetlist.songs,
              );
            } catch (error) {
              initialMatchErrorMessage =
                error instanceof Error ? error.message : "Unable to match Apple Music tracks.";
            }
          }
        } catch (error) {
          initialFetchErrorMessage =
            error instanceof Error ? error.message : "Unable to fetch that setlist.";
        }
      }
    } catch (error) {
      initialErrorMessage = error instanceof Error ? error.message : "Unable to parse that URL.";
    }
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>Setlist to playlist</p>
          <h1>Turn a setlist.fm show into a playlist.</h1>
          <p>
            Load a show, match tracks on Apple Music (available to everyone), then
            create your playlist. Spotify matching is invite-only while the app is in
            Spotify development mode.
          </p>
        </section>

        <SetlistUrlForm
          initialAppleMusicMatches={initialAppleMusicMatches}
          initialErrorMessage={initialErrorMessage}
          initialFetchErrorMessage={initialFetchErrorMessage}
          initialFetchedSetlist={initialFetchedSetlist}
          initialMatchErrorMessage={initialMatchErrorMessage}
          initialParsedSetlist={initialParsedSetlist}
          initialSetlistUrl={initialSetlistUrl}
        />
      </main>
    </div>
  );
}
