import type { SetlistSongMatch } from "./appleMusic";
import type { NormalizedSetlistSong } from "./setlistfm";

export const MATCH_PROGRESS_CHUNK_SIZE = 5;

export type MatchProgress = {
  completed: number;
  total: number;
};

type MatchSongsWithProgressOptions = {
  endpoint: string;
  onProgress?: (progress: MatchProgress) => void;
  songs: NormalizedSetlistSong[];
};

export async function matchSongsWithProgress({
  endpoint,
  onProgress,
  songs,
}: MatchSongsWithProgressOptions): Promise<SetlistSongMatch[]> {
  const total = songs.length;
  const allMatches: SetlistSongMatch[] = [];

  onProgress?.({ completed: 0, total });

  for (let index = 0; index < songs.length; index += MATCH_PROGRESS_CHUNK_SIZE) {
    const chunk = songs.slice(index, index + MATCH_PROGRESS_CHUNK_SIZE);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ songs: chunk }),
    });
    const responseBody: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        responseBody &&
        typeof responseBody === "object" &&
        "error" in responseBody &&
        typeof responseBody.error === "string"
          ? responseBody.error
          : "Unable to match tracks.";
      throw new Error(message);
    }

    if (
      !responseBody ||
      typeof responseBody !== "object" ||
      !("matches" in responseBody) ||
      !Array.isArray(responseBody.matches)
    ) {
      throw new Error("Unexpected match API response.");
    }

    allMatches.push(...(responseBody.matches as SetlistSongMatch[]));
    onProgress?.({
      completed: Math.min(index + chunk.length, total),
      total,
    });
  }

  return allMatches;
}
