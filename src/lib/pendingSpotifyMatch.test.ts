import { describe, expect, it, beforeEach, afterEach } from "vitest";

import {
  clearPendingSpotifyMatch,
  readPendingSpotifyMatch,
  savePendingSpotifyMatch,
} from "./pendingSpotifyMatch";

describe("pendingSpotifyMatch", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("round-trips a pending Spotify match intent", () => {
    savePendingSpotifyMatch({
      setlistId: "3b497c60",
      setlistUrl:
        "https://www.setlist.fm/setlist/jayz/2026/yankee-stadium-the-bronx-ny-3b497c60.html",
    });

    expect(readPendingSpotifyMatch()).toEqual({
      setlistId: "3b497c60",
      setlistUrl:
        "https://www.setlist.fm/setlist/jayz/2026/yankee-stadium-the-bronx-ny-3b497c60.html",
    });
  });

  it("clears pending intents", () => {
    savePendingSpotifyMatch({
      setlistId: "3b497c60",
      setlistUrl:
        "https://www.setlist.fm/setlist/jayz/2026/yankee-stadium-the-bronx-ny-3b497c60.html",
    });
    clearPendingSpotifyMatch();
    expect(readPendingSpotifyMatch()).toBeNull();
  });

  it("ignores invalid stored payloads", () => {
    window.sessionStorage.setItem("setlist-playlist:pending-spotify-match", "{bad");
    expect(readPendingSpotifyMatch()).toBeNull();
  });
});
