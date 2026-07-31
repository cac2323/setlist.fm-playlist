import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import Home from "./page";

vi.mock("@/lib/setlistfm", () => ({
  fetchSetlistById: vi.fn(async () => ({
    artistName: "Jay-Z",
    eventDate: "13-07-2026",
    id: "3b497c60",
    songs: [{ artistName: "Jay-Z", name: "Encore", position: 1 }],
    venue: { name: "Yankee Stadium" },
  })),
}));

vi.mock("@/lib/appleMusic", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/appleMusic")>();

  return {
    ...actual,
    matchSetlistSongsToAppleMusic: vi.fn(async () => [
      {
        alternatives: [],
        confidence: 0.98,
        match: {
          albumName: "The Black Album",
          artistName: "JAY-Z",
          confidence: 0.98,
          id: "apple-track-1",
          name: "Encore",
          reasons: ["Exact title match", "Artist match"],
        },
        query: "Jay-Z Encore",
        reasons: ["Exact title match", "Artist match"],
        selectedMatches: [
          {
            confidence: 0.98,
            match: {
              albumName: "The Black Album",
              artistName: "JAY-Z",
              confidence: 0.98,
              id: "apple-track-1",
              name: "Encore",
              reasons: ["Exact title match", "Artist match"],
            },
            query: "Jay-Z Encore",
            reasons: ["Exact title match", "Artist match"],
            segmentTitle: "Encore",
          status: "matched",
          },
        ],
        setlistSong: { artistName: "Jay-Z", name: "Encore", position: 1 },
        status: "matched",
      },
    ]),
  };
});

describe("Home", () => {
  it("renders the guided workflow shell with progressive enhancement controls", async () => {
    render(await Home({}));

    expect(
      screen.getByRole("heading", {
        name: /turn a setlist\.fm show into a playlist/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/match tracks on apple music or spotify/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/setlist url/i)).toBeInTheDocument();
    const loadButton = screen.getByRole("button", { name: "Load setlist" });
    expect(loadButton).toHaveAttribute("name", "fetch-setlist");
    expect(loadButton).toHaveAttribute("value", "1");
    expect(screen.getByRole("button", { name: /review and create/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /done/i })).toBeDisabled();
    expect(screen.queryByText(/current state/i)).not.toBeInTheDocument();
  });

  it("renders a parsed setlist id from query params", async () => {
    render(
      await Home({
        searchParams: Promise.resolve({
          "setlist-url":
            "https://www.setlist.fm/setlist/jayz/2026/yankee-stadium-the-bronx-ny-3b497c60.html",
        }),
      }),
    );

    expect(screen.getByText("ID 3b497c60")).toBeInTheDocument();
    expect(screen.getByLabelText(/setlist url/i)).toBeInTheDocument();
  });

  it("fetches and renders setlist songs from query params", async () => {
    render(
      await Home({
        searchParams: Promise.resolve({
          "fetch-setlist": "1",
          "setlist-url":
            "https://www.setlist.fm/setlist/jayz/2026/yankee-stadium-the-bronx-ny-3b497c60.html",
        }),
      }),
    );

    expect(screen.getByText("Encore")).toBeInTheDocument();
    expect(screen.getByText(/yankee stadium/i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /loaded jay-z/i }),
    ).toBeInTheDocument();
  });

  it("matches and renders Apple Music tracks from query params", async () => {
    render(
      await Home({
        searchParams: Promise.resolve({
          "fetch-setlist": "1",
          "match-apple-music": "1",
          "setlist-url":
            "https://www.setlist.fm/setlist/jayz/2026/yankee-stadium-the-bronx-ny-3b497c60.html",
        }),
      }),
    );

    expect(
      screen.getByRole("heading", { name: /review and create/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/jay-z encore/i)).toBeInTheDocument();
    expect(screen.getByText(/jay-z · the black album/i)).toBeInTheDocument();
  });
});
