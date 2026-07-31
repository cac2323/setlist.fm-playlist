import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  authorizeAppleMusic: vi.fn(),
  getAppleMusicAuthorizationStatus: vi.fn(),
  unauthorizeAppleMusic: vi.fn(),
}));

vi.mock("@/lib/appleMusicAuth", () => authMocks);

import { AppleMusicAuthorization } from "./AppleMusicAuthorization";

describe("AppleMusicAuthorization", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("authorizes a disconnected Apple Music user", async () => {
    authMocks.getAppleMusicAuthorizationStatus.mockResolvedValue(false);
    authMocks.authorizeAppleMusic.mockResolvedValue(true);

    render(<AppleMusicAuthorization />);

    const connectButton = await screen.findByRole("button", { name: "Connect Apple Music" });
    fireEvent.click(connectButton);

    await waitFor(() =>
      expect(screen.getByText("Apple Music connected")).toBeInTheDocument(),
    );
    expect(authMocks.authorizeAppleMusic).toHaveBeenCalledOnce();
  });

  it("shows authorization denial without marking the user connected", async () => {
    authMocks.getAppleMusicAuthorizationStatus.mockResolvedValue(false);
    authMocks.authorizeAppleMusic.mockRejectedValue(
      new Error("Apple Music authorization was denied."),
    );

    render(<AppleMusicAuthorization />);

    fireEvent.click(await screen.findByRole("button", { name: "Connect Apple Music" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Apple Music authorization was denied.",
      ),
    );
    expect(screen.getByText("Apple Music not connected")).toBeInTheDocument();
  });

  it("disconnects an authorized Apple Music user", async () => {
    authMocks.getAppleMusicAuthorizationStatus.mockResolvedValue(true);
    authMocks.unauthorizeAppleMusic.mockResolvedValue(undefined);

    render(<AppleMusicAuthorization />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Disconnect Apple Music" }),
    );

    await waitFor(() =>
      expect(screen.getByText("Apple Music not connected")).toBeInTheDocument(),
    );
    expect(authMocks.unauthorizeAppleMusic).toHaveBeenCalledOnce();
  });

  it("shows initialization errors and allows a retry", async () => {
    authMocks.getAppleMusicAuthorizationStatus.mockRejectedValue(
      new Error("Apple Music credentials are not configured."),
    );

    render(<AppleMusicAuthorization />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Apple Music credentials are not configured.",
    );
    expect(screen.getByRole("button", { name: "Connect Apple Music" })).toBeEnabled();
  });

  it("renders a compact connection control for the creation step", async () => {
    authMocks.getAppleMusicAuthorizationStatus.mockResolvedValue(false);

    render(<AppleMusicAuthorization compact />);

    expect(
      screen.getByRole("heading", { name: "Apple Music connection", level: 3 }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/authorization grants this app access/i),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Connect Apple Music" }),
    ).toBeEnabled();
  });
});
