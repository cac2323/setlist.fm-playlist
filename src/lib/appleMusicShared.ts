/** Client-safe Apple Music helpers (no server-only imports). */

export function getSetlistSongMatchKey(songMatch: {
  setlistSong: {
    name: string;
    position: number;
  };
}) {
  return `${songMatch.setlistSong.position}:${songMatch.setlistSong.name}`;
}

export function getSelectedMatchReviewKey(
  songMatch: {
    setlistSong: {
      name: string;
      position: number;
    };
  },
  selectedMatch: {
    segmentTitle: string;
  },
) {
  return `${getSetlistSongMatchKey(songMatch)}:${selectedMatch.segmentTitle}`;
}
