import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  beginSpotifyAuthorization: vi.fn(),
  getSpotifyAuthorizationStatus: vi.fn(),
  unauthorizeSpotify: vi.fn(),
}));

vi.mock("@/lib/spotifyAuthClient", () => authMocks);

import { SpotifyAuthorization } from "./SpotifyAuthorization";

describe("SpotifyAuthorization", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("starts Spotify authorization for a disconnected user", async () => {
    authMocks.getSpotifyAuthorizationStatus.mockResolvedValue({ connected: false });

    render(<SpotifyAuthorization />);

    const connectButton = await screen.findByRole("button", { name: "Connect Spotify" });
    fireEvent.click(connectButton);

    expect(authMocks.beginSpotifyAuthorization).toHaveBeenCalledOnce();
    expect(screen.getByText("Redirecting to Spotify...")).toBeInTheDocument();
  });

  it("disconnects an authorized Spotify user", async () => {
    authMocks.getSpotifyAuthorizationStatus.mockResolvedValue({
      connected: true,
      displayName: "Canyon",
    });
    authMocks.unauthorizeSpotify.mockResolvedValue(undefined);

    render(<SpotifyAuthorization />);

    expect(await screen.findByText("Spotify connected as Canyon")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Disconnect Spotify" }));

    await waitFor(() =>
      expect(screen.getByText("Spotify not connected")).toBeInTheDocument(),
    );
    expect(authMocks.unauthorizeSpotify).toHaveBeenCalledOnce();
  });

  it("renders a compact connection control for the creation step", async () => {
    authMocks.getSpotifyAuthorizationStatus.mockResolvedValue({ connected: false });

    render(<SpotifyAuthorization compact />);

    expect(
      screen.getByRole("heading", { name: "Spotify connection", level: 3 }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/authorization grants this app access/i),
    ).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Connect Spotify" })).toBeEnabled();
  });

  it("describes cookie duration accurately when not compact", async () => {
    authMocks.getSpotifyAuthorizationStatus.mockResolvedValue({ connected: false });

    render(<SpotifyAuthorization />);

    expect(
      await screen.findByText(/httpOnly cookies for up to about 30 days/i),
    ).toBeInTheDocument();
  });
});
