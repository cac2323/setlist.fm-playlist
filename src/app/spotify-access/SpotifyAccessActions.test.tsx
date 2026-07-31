import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  beginSpotifyAuthorization: vi.fn(),
  getSpotifyAuthorizationStatus: vi.fn(),
}));

const navigationMocks = vi.hoisted(() => ({
  navigateTo: vi.fn(),
}));

vi.mock("@/lib/spotifyAuthClient", () => authMocks);
vi.mock("@/lib/browserNavigation", () => navigationMocks);

import { SpotifyAccessActions } from "./SpotifyAccessActions";

describe("SpotifyAccessActions", () => {
  afterEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });

  it("starts Spotify OAuth for approved testers", async () => {
    authMocks.getSpotifyAuthorizationStatus.mockResolvedValue({ connected: false });

    render(<SpotifyAccessActions />);

    fireEvent.click(await screen.findByRole("button", { name: /connect spotify/i }));

    expect(authMocks.beginSpotifyAuthorization).toHaveBeenCalledOnce();
  });

  it("offers continue matching when already connected with a pending setlist", async () => {
    window.sessionStorage.setItem(
      "setlist-playlist:pending-spotify-match",
      JSON.stringify({
        setlistId: "3b497c60",
        setlistUrl:
          "https://www.setlist.fm/setlist/jayz/2026/yankee-stadium-the-bronx-ny-3b497c60.html",
      }),
    );
    authMocks.getSpotifyAuthorizationStatus.mockResolvedValue({ connected: true });

    render(<SpotifyAccessActions />);

    fireEvent.click(await screen.findByRole("button", { name: /continue matching/i }));

    await waitFor(() =>
      expect(navigationMocks.navigateTo).toHaveBeenCalledWith(
        "/?spotify_match=1#setlist-workflow",
      ),
    );
  });
});
