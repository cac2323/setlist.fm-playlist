import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearPendingAppleMusicMatch,
  readPendingAppleMusicMatch,
  savePendingAppleMusicMatch,
} from "./pendingAppleMusicMatch";

describe("pendingAppleMusicMatch", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T12:00:00.000Z"));
  });

  afterEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    vi.useRealTimers();
  });

  it("round-trips via localStorage for mobile auth redirects", () => {
    savePendingAppleMusicMatch({
      setlistId: "3b497c60",
      setlistUrl:
        "https://www.setlist.fm/setlist/jayz/2026/yankee-stadium-the-bronx-ny-3b497c60.html",
    });

    window.sessionStorage.clear();

    expect(readPendingAppleMusicMatch()).toEqual({
      savedAt: Date.parse("2026-08-01T12:00:00.000Z"),
      setlistId: "3b497c60",
      setlistUrl:
        "https://www.setlist.fm/setlist/jayz/2026/yankee-stadium-the-bronx-ny-3b497c60.html",
    });
  });

  it("clears pending intents from both stores", () => {
    savePendingAppleMusicMatch({
      setlistId: "3b497c60",
      setlistUrl:
        "https://www.setlist.fm/setlist/jayz/2026/yankee-stadium-the-bronx-ny-3b497c60.html",
    });
    clearPendingAppleMusicMatch();
    expect(readPendingAppleMusicMatch()).toBeNull();
    expect(window.localStorage.getItem("setlist-playlist:pending-apple-music-match")).toBeNull();
  });

  it("expires stale intents", () => {
    savePendingAppleMusicMatch({
      setlistId: "3b497c60",
      setlistUrl:
        "https://www.setlist.fm/setlist/jayz/2026/yankee-stadium-the-bronx-ny-3b497c60.html",
    });

    vi.setSystemTime(new Date("2026-08-01T14:00:01.000Z"));
    expect(readPendingAppleMusicMatch()).toBeNull();
  });

  it("ignores invalid stored payloads", () => {
    window.localStorage.setItem("setlist-playlist:pending-apple-music-match", "{bad");
    expect(readPendingAppleMusicMatch()).toBeNull();
  });
});
