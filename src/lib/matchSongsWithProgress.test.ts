import { describe, expect, it, vi } from "vitest";

import { MATCH_PROGRESS_CHUNK_SIZE, matchSongsWithProgress } from "./matchSongsWithProgress";

describe("matchSongsWithProgress", () => {
  it("requests songs in chunks and reports progress", async () => {
    const progressUpdates: Array<{ completed: number; total: number }> = [];
    const songs = Array.from({ length: MATCH_PROGRESS_CHUNK_SIZE + 2 }, (_, index) => ({
      artistName: "Jay-Z",
      name: `Song ${index + 1}`,
      position: index + 1,
    }));

    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        songs: Array<{ name: string; position: number }>;
      };
      return new Response(
        JSON.stringify({
          matches: body.songs.map((song) => ({
            alternatives: [],
            confidence: 1,
            match: { artistName: "JAY-Z", id: `id-${song.position}`, name: song.name },
            query: `Jay-Z ${song.name}`,
            reasons: [],
            selectedMatches: [],
            setlistSong: song,
            status: "matched",
          })),
        }),
        { status: 200 },
      );
    });

    const matches = await matchSongsWithProgress({
      endpoint: "/api/apple-music/match",
      onProgress: (progress) => progressUpdates.push(progress),
      songs,
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(matches).toHaveLength(songs.length);
    expect(progressUpdates).toEqual([
      { completed: 0, total: songs.length },
      { completed: MATCH_PROGRESS_CHUNK_SIZE, total: songs.length },
      { completed: songs.length, total: songs.length },
    ]);
  });
});
