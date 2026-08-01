import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  authorizeAppleMusic: vi.fn(),
  createAppleMusicPlaylist: vi.fn(),
  getAppleMusicAuthorizationStatus: vi.fn(),
  subscribeToAppleMusicAuthorization: vi.fn(),
  unauthorizeAppleMusic: vi.fn(),
}));

const spotifyAuthMocks = vi.hoisted(() => ({
  beginSpotifyAuthorization: vi.fn(),
  createSpotifyPlaylist: vi.fn(),
  getSpotifyAuthorizationStatus: vi.fn(),
  subscribeToSpotifyAuthorization: vi.fn(),
  unauthorizeSpotify: vi.fn(),
}));

const navigationMocks = vi.hoisted(() => ({
  navigateTo: vi.fn(),
}));

vi.mock("@/lib/appleMusicAuth", () => authMocks);
vi.mock("@/lib/spotifyAuthClient", () => spotifyAuthMocks);
vi.mock("@/lib/browserNavigation", () => navigationMocks);

import { SetlistUrlForm } from "./SetlistUrlForm";

describe("SetlistUrlForm", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    authMocks.getAppleMusicAuthorizationStatus.mockResolvedValue(false);
    authMocks.authorizeAppleMusic.mockResolvedValue(true);
    authMocks.subscribeToAppleMusicAuthorization.mockReturnValue(vi.fn());
    spotifyAuthMocks.getSpotifyAuthorizationStatus.mockResolvedValue({ connected: false });
    spotifyAuthMocks.subscribeToSpotifyAuthorization.mockReturnValue(vi.fn());
  });

  afterEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    window.history.pushState({}, "", "/");
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("loads a setlist in one action and advances focus to the loaded summary", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          setlist: {
            artistName: "Jay-Z",
            id: "3b497c60",
            songs: [{ artistName: "Jay-Z", name: "Encore", position: 1 }],
          },
        }),
        { status: 200 },
      ),
    );
    render(<SetlistUrlForm />);

    fireEvent.change(screen.getByLabelText(/setlist url/i), {
      target: {
        value:
          "https://www.setlist.fm/setlist/jayz/2026/yankee-stadium-the-bronx-ny-3b497c60.html",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Load setlist" }));

    const heading = await screen.findByRole("heading", { name: /loaded jay-z/i });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByRole("button", { name: /match with apple music/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/setlist url/i)).not.toBeInTheDocument();
  });

  it("shows a validation error for invalid input", () => {
    render(<SetlistUrlForm />);

    fireEvent.change(screen.getByLabelText(/setlist url/i), {
      target: { value: "https://example.com/not-a-setlist" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Load setlist" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Enter a URL from setlist.fm.");
  });

  it("allows navigation back to completed steps while future steps stay locked", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          setlist: {
            artistName: "Jay-Z",
            eventDate: "13-07-2026",
            id: "3b497c60",
            songs: [
              { artistName: "Jay-Z", name: "Encore", position: 1 },
              { artistName: "Jay-Z", name: "Run This Town", position: 2 },
            ],
            venue: { name: "Yankee Stadium" },
          },
        }),
        { status: 200 },
      ),
    );

    render(<SetlistUrlForm />);

    fireEvent.change(screen.getByLabelText(/setlist url/i), {
      target: {
        value:
          "https://www.setlist.fm/setlist/jayz/2026/yankee-stadium-the-bronx-ny-3b497c60.html",
      },
    });
    expect(screen.getByRole("button", { name: /review and create/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Load setlist" }));

    await waitFor(() => expect(screen.getByText("Encore")).toBeInTheDocument());
    expect(screen.getByText("Run This Town")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/setlist?id=3b497c60");
    const stepNavigation = within(
      screen.getByRole("navigation", { name: /setlist playlist progress/i }),
    );
    const loadStep = stepNavigation.getByRole("button", { name: /load setlist/i });
    const createStep = stepNavigation.getByRole("button", { name: /review and create/i });
    expect(createStep).toBeDisabled();
    expect(loadStep).toBeEnabled();
    fireEvent.click(loadStep);
    expect(screen.getByRole("heading", { name: /loaded jay-z/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /match with apple music/i })).toBeInTheDocument();
  });

  it("resets the workflow when loading another setlist", async () => {
    render(
      <SetlistUrlForm
        initialFetchedSetlist={{
          artistName: "Jay-Z",
          id: "3b497c60",
          songs: [{ artistName: "Jay-Z", name: "Encore", position: 1 }],
        }}
        initialParsedSetlist={{
          id: "3b497c60",
          url: "https://www.setlist.fm/setlist/jayz/2026/yankee-stadium-the-bronx-ny-3b497c60.html",
        }}
        initialSetlistUrl="https://www.setlist.fm/setlist/jayz/2026/yankee-stadium-the-bronx-ny-3b497c60.html"
      />,
    );

    expect(screen.getByRole("heading", { name: /loaded jay-z/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load another setlist" }));

    const urlInput = screen.getByLabelText(/setlist url/i);
    expect(urlInput).toHaveValue("");
    expect(urlInput).toHaveFocus();
    expect(screen.queryByText("Encore")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /review and create/i })).toBeDisabled();
  });

  it("shows an API error when fetching songs fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Missing SETLISTFM_API_KEY." }), { status: 500 }),
    );

    render(<SetlistUrlForm />);

    fireEvent.change(screen.getByLabelText(/setlist url/i), {
      target: {
        value:
          "https://www.setlist.fm/setlist/jayz/2026/yankee-stadium-the-bronx-ny-3b497c60.html",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Load setlist" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Missing SETLISTFM_API_KEY."),
    );
  });

  it("shows Spotify matching when the destination is enabled", async () => {
    render(
      <SetlistUrlForm
        initialFetchedSetlist={{
          artistName: "Jay-Z",
          id: "3b497c60",
          songs: [{ artistName: "Jay-Z", name: "Encore", position: 1 }],
        }}
        initialParsedSetlist={{
          id: "3b497c60",
          url: "https://www.setlist.fm/setlist/jayz/2026/yankee-stadium-the-bronx-ny-3b497c60.html",
        }}
      />,
    );

    expect(screen.getByRole("button", { name: /match with apple music/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /match with spotify/i })).toBeInTheDocument();
    expect(
      screen.getByText(/choose a streaming service to authorize/i),
    ).toBeInTheDocument();
  });

  it("routes connected users through the Spotify access page before matching", async () => {
    spotifyAuthMocks.getSpotifyAuthorizationStatus.mockResolvedValue({ connected: true });

    render(
      <SetlistUrlForm
        initialFetchedSetlist={{
          artistName: "Jay-Z",
          id: "3b497c60",
          songs: [{ artistName: "Jay-Z", name: "Encore", position: 1 }],
        }}
        initialParsedSetlist={{
          id: "3b497c60",
          url: "https://www.setlist.fm/setlist/jayz/2026/yankee-stadium-the-bronx-ny-3b497c60.html",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /match with spotify/i }));

    await waitFor(() =>
      expect(navigationMocks.navigateTo).toHaveBeenCalledWith("/spotify-access"),
    );
    expect(spotifyAuthMocks.beginSpotifyAuthorization).not.toHaveBeenCalled();
  });

  it("saves a pending Spotify match and opens the invite access page", async () => {
    render(
      <SetlistUrlForm
        initialFetchedSetlist={{
          artistName: "Jay-Z",
          id: "3b497c60",
          songs: [{ artistName: "Jay-Z", name: "Encore", position: 1 }],
        }}
        initialParsedSetlist={{
          id: "3b497c60",
          url: "https://www.setlist.fm/setlist/jayz/2026/yankee-stadium-the-bronx-ny-3b497c60.html",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /match with spotify/i }));

    await waitFor(() =>
      expect(navigationMocks.navigateTo).toHaveBeenCalledWith("/spotify-access"),
    );
    expect(window.sessionStorage.getItem("setlist-playlist:pending-spotify-match")).toContain(
      "3b497c60",
    );
    expect(spotifyAuthMocks.beginSpotifyAuthorization).not.toHaveBeenCalled();
    expect(authMocks.authorizeAppleMusic).not.toHaveBeenCalled();
  });

  it("does not leave Match buttons stuck after routing to Spotify access", async () => {
    render(
      <SetlistUrlForm
        initialFetchedSetlist={{
          artistName: "Jay-Z",
          id: "3b497c60",
          songs: [{ artistName: "Jay-Z", name: "Encore", position: 1 }],
        }}
        initialParsedSetlist={{
          id: "3b497c60",
          url: "https://www.setlist.fm/setlist/jayz/2026/yankee-stadium-the-bronx-ny-3b497c60.html",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /match with spotify/i }));

    await waitFor(() =>
      expect(navigationMocks.navigateTo).toHaveBeenCalledWith("/spotify-access"),
    );
    expect(screen.getByRole("button", { name: /match with spotify/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /match with apple music/i })).toBeEnabled();
  });

  it("resumes Spotify matching after a successful OAuth return under StrictMode", async () => {
    window.sessionStorage.setItem(
      "setlist-playlist:pending-spotify-match",
      JSON.stringify({
        setlistId: "3b497c60",
        setlistUrl:
          "https://www.setlist.fm/setlist/jayz/2026/yankee-stadium-the-bronx-ny-3b497c60.html",
      }),
    );
    window.history.pushState({}, "", "/?spotify_auth=success#setlist-workflow");
    spotifyAuthMocks.getSpotifyAuthorizationStatus.mockResolvedValue({
      connected: true,
      displayName: "Canyon",
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/setlist")) {
        return new Response(
          JSON.stringify({
            setlist: {
              artistName: "Jay-Z",
              id: "3b497c60",
              songs: [{ artistName: "Jay-Z", name: "Encore", position: 1 }],
            },
          }),
          { status: 200 },
        );
      }

      return new Response(
        JSON.stringify({
          matches: [
            {
              alternatives: [],
              confidence: 1,
              match: {
                artistName: "JAY-Z",
                confidence: 1,
                id: "spotify-track-1",
                name: "Encore",
                reasons: ["Exact title match"],
              },
              query: "Jay-Z Encore",
              reasons: ["Exact title match"],
              selectedMatches: [],
              setlistSong: { artistName: "Jay-Z", name: "Encore", position: 1 },
              status: "matched",
            },
          ],
        }),
        { status: 200 },
      );
    });

    render(
      <StrictMode>
        <SetlistUrlForm />
      </StrictMode>,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /review and create/i }),
      ).toBeInTheDocument(),
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/spotify/match",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("resumes Spotify matching after a successful OAuth return", async () => {
    window.sessionStorage.setItem(
      "setlist-playlist:pending-spotify-match",
      JSON.stringify({
        setlistId: "3b497c60",
        setlistUrl:
          "https://www.setlist.fm/setlist/jayz/2026/yankee-stadium-the-bronx-ny-3b497c60.html",
      }),
    );
    window.history.pushState({}, "", "/?spotify_auth=success#setlist-workflow");
    spotifyAuthMocks.getSpotifyAuthorizationStatus.mockResolvedValue({
      connected: true,
      displayName: "Canyon",
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/setlist")) {
        return new Response(
          JSON.stringify({
            setlist: {
              artistName: "Jay-Z",
              id: "3b497c60",
              songs: [{ artistName: "Jay-Z", name: "Encore", position: 1 }],
            },
          }),
          { status: 200 },
        );
      }

      return new Response(
        JSON.stringify({
          matches: [
            {
              alternatives: [],
              confidence: 1,
              match: {
                artistName: "JAY-Z",
                confidence: 1,
                id: "spotify-track-1",
                name: "Encore",
                reasons: ["Exact title match"],
              },
              query: "Jay-Z Encore",
              reasons: ["Exact title match"],
              selectedMatches: [],
              setlistSong: { artistName: "Jay-Z", name: "Encore", position: 1 },
              status: "matched",
            },
          ],
        }),
        { status: 200 },
      );
    });

    render(<SetlistUrlForm />);

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /review and create/i }),
      ).toBeInTheDocument(),
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/spotify/match",
      expect.objectContaining({ method: "POST" }),
    );
    expect(window.sessionStorage.getItem("setlist-playlist:pending-spotify-match")).toBeNull();
  });

  it("resumes Apple Music matching after a mobile auth redirect wipe", async () => {
    window.localStorage.setItem(
      "setlist-playlist:pending-apple-music-match",
      JSON.stringify({
        savedAt: Date.now(),
        setlistId: "3b497c60",
        setlistUrl:
          "https://www.setlist.fm/setlist/jayz/2026/yankee-stadium-the-bronx-ny-3b497c60.html",
      }),
    );
    authMocks.getAppleMusicAuthorizationStatus.mockResolvedValue(true);

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/api/setlist?")) {
        return new Response(
          JSON.stringify({
            setlist: {
              artistName: "Jay-Z",
              id: "3b497c60",
              songs: [{ artistName: "Jay-Z", name: "Encore", position: 1 }],
            },
          }),
          { status: 200 },
        );
      }

      if (url.includes("/api/apple-music/match") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            matches: [
              {
                alternatives: [],
                confidence: 0.98,
                match: {
                  albumName: "The Black Album",
                  artistName: "JAY-Z",
                  confidence: 0.98,
                  id: "apple-track-1",
                  name: "Encore",
                  reasons: ["Exact title match"],
                },
                query: "Jay-Z Encore",
                reasons: ["Exact title match"],
                setlistSong: { artistName: "Jay-Z", name: "Encore", position: 1 },
                status: "matched",
              },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({ error: `Unexpected fetch: ${url}` }), {
        status: 500,
      });
    });

    render(<SetlistUrlForm />);

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /review and create/i }),
      ).toBeInTheDocument(),
    );
    expect(window.localStorage.getItem("setlist-playlist:pending-apple-music-match")).toBeNull();
    expect(authMocks.authorizeAppleMusic).not.toHaveBeenCalled();
  });

  it("authorizes Apple Music when needed, then matches", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          matches: [
            {
              alternatives: [
                {
                  albumName: "Karaoke Hits",
                  artistName: "Karaoke Band",
                  confidence: 0.52,
                  id: "karaoke-track",
                  name: "Encore",
                  reasons: ["Exact title match"],
                },
              ],
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
              setlistSong: { artistName: "Jay-Z", name: "Encore", position: 1 },
              status: "matched",
            },
          ],
        }),
        { status: 200 },
      ),
    );

    render(
      <SetlistUrlForm
        initialFetchedSetlist={{
          artistName: "Jay-Z",
          id: "3b497c60",
          songs: [{ artistName: "Jay-Z", name: "Encore", position: 1 }],
        }}
        initialParsedSetlist={{
          id: "3b497c60",
          url: "https://www.setlist.fm/setlist/jayz/2026/yankee-stadium-the-bronx-ny-3b497c60.html",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /match with apple music/i }));

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /review and create/i }),
      ).toBeInTheDocument(),
    );
    expect(authMocks.authorizeAppleMusic).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("region", { name: /proposed apple music matches/i }),
    ).toHaveAttribute("tabindex", "0");
    expect(screen.getByText(/jay-z · the black album/i)).toBeInTheDocument();
    expect(screen.getByText(/jay-z encore/i)).toBeInTheDocument();
    expect(screen.getByText(/98% confidence/i)).toBeInTheDocument();
    expect(screen.getByText("Exact title match")).toBeInTheDocument();
    expect(screen.getByText("Artist match")).toBeInTheDocument();
    expect(screen.getByText(/alternatives/i)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/apple-music/match",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(screen.getByText(/apple music is connected/i)).toBeInTheDocument();
  });

  it("lets the user choose an alternate for one medley segment", async () => {
    authMocks.getAppleMusicAuthorizationStatus.mockResolvedValue(true);

    render(
      <SetlistUrlForm
        initialAppleMusicMatches={[
          {
            alternatives: [
              {
                artistName: "Mereba",
                confidence: 0.88,
                id: "send-me-alt",
                name: "You Send Me",
                reasons: ["Title match"],
              },
            ],
            confidence: 1,
            match: {
              artistName: "Mereba",
              confidence: 1,
              id: "bet-track",
              name: "Bet",
              reasons: ["Exact title match"],
            },
            query: "Mereba Bet / You Send Me",
            reasons: ["Matched 1 of 2 title segments"],
            selectedMatches: [
              {
                confidence: 1,
                match: {
                  artistName: "Mereba",
                  confidence: 1,
                  id: "bet-track",
                  name: "Bet",
                  reasons: ["Exact title match"],
                },
                query: "Mereba Bet / You Send Me",
                reasons: ["Exact title match"],
                segmentTitle: "Bet",
                status: "matched",
              },
              {
                confidence: 0.7,
                match: {
                  artistName: "Other Artist",
                  confidence: 0.7,
                  id: "placeholder",
                  name: "You Send Me",
                  reasons: ["Needs review"],
                },
                query: "Mereba You Send Me",
                reasons: ["Needs review"],
                segmentTitle: "You Send Me",
                status: "needs_review",
              },
            ],
            setlistSong: {
              artistName: "Mereba",
              name: "Bet / You Send Me",
              position: 1,
            },
            status: "needs_review",
          },
        ]}
        initialFetchedSetlist={{
          artistName: "Mereba",
          id: "6b585e1a",
          songs: [{ artistName: "Mereba", name: "Bet / You Send Me", position: 1 }],
        }}
        initialParsedSetlist={{
          id: "6b585e1a",
          url: "https://www.setlist.fm/setlist/mereba/2025/koko-london-england-6b585e1a.html",
        }}
      />,
    );

    const youSendMeAlternatives = screen
      .getByText(/alternatives for you send me/i)
      .closest("details");
    expect(youSendMeAlternatives).not.toBeNull();
    fireEvent.click(screen.getByText(/alternatives for you send me/i));
    fireEvent.click(
      within(youSendMeAlternatives as HTMLElement).getByRole("button", {
        name: /use this match/i,
      }),
    );

    expect(screen.getByText(/2 matched/i)).toBeInTheDocument();
    expect(screen.queryByText(/artist may be wrong/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /find a match/i })).not.toBeInTheDocument();
  });

  it("lets the user choose an alternate Apple Music match", async () => {
    authMocks.getAppleMusicAuthorizationStatus.mockResolvedValue(true);

    render(
      <SetlistUrlForm
        initialAppleMusicMatches={[
          {
            alternatives: [
              {
                albumName: "The Black Album",
                artistName: "JAY-Z",
                confidence: 0.9,
                id: "alt-track",
                name: "Encore (Clean)",
                reasons: ["Artist match"],
              },
            ],
            confidence: 0.98,
            match: {
              albumName: "Karaoke Hits",
              artistName: "Karaoke Band",
              confidence: 0.98,
              id: "primary-track",
              name: "Encore",
              reasons: ["Exact title match"],
            },
            query: "Jay-Z Encore",
            reasons: ["Exact title match"],
            selectedMatches: [
              {
                confidence: 0.98,
                match: {
                  albumName: "Karaoke Hits",
                  artistName: "Karaoke Band",
                  confidence: 0.98,
                  id: "primary-track",
                  name: "Encore",
                  reasons: ["Exact title match"],
                },
                query: "Jay-Z Encore",
                reasons: ["Exact title match"],
                segmentTitle: "Encore",
                status: "matched",
              },
            ],
            setlistSong: { artistName: "Jay-Z", name: "Encore", position: 1 },
            status: "matched",
          },
        ]}
        initialFetchedSetlist={{
          artistName: "Jay-Z",
          id: "3b497c60",
          songs: [{ artistName: "Jay-Z", name: "Encore", position: 1 }],
        }}
        initialParsedSetlist={{
          id: "3b497c60",
          url: "https://www.setlist.fm/setlist/jayz/2026/yankee-stadium-the-bronx-ny-3b497c60.html",
        }}
      />,
    );

    fireEvent.click(screen.getByText(/alternatives/i));
    fireEvent.click(screen.getByRole("button", { name: /use this match/i }));

    expect(screen.getByText(/encore \(clean\)/i)).toBeInTheDocument();
    expect(screen.getByText(/jay-z · the black album/i)).toBeInTheDocument();
    expect(screen.getByText(/karaoke band/i)).toBeInTheDocument();
  });

  it("filters the review list by match status tabs", async () => {
    authMocks.getAppleMusicAuthorizationStatus.mockResolvedValue(true);

    render(
      <SetlistUrlForm
        initialAppleMusicMatches={[
          {
            alternatives: [],
            confidence: 1,
            match: {
              artistName: "JAY-Z",
              confidence: 1,
              id: "matched-track",
              name: "Encore",
              reasons: ["Exact title match"],
            },
            query: "Jay-Z Encore",
            reasons: ["Exact title match"],
            selectedMatches: [
              {
                confidence: 1,
                match: {
                  artistName: "JAY-Z",
                  confidence: 1,
                  id: "matched-track",
                  name: "Encore",
                  reasons: ["Exact title match"],
                },
                query: "Jay-Z Encore",
                reasons: ["Exact title match"],
                segmentTitle: "Encore",
                status: "matched",
              },
            ],
            setlistSong: { artistName: "Jay-Z", name: "Encore", position: 1 },
            status: "matched",
          },
          {
            alternatives: [],
            confidence: 0.4,
            match: {
              artistName: "Wrong Artist",
              confidence: 0.4,
              id: "review-track",
              name: "99 Problems",
              reasons: ["Title-only match"],
            },
            query: "Jay-Z 99 Problems",
            reasons: ["Artist not confirmed"],
            selectedMatches: [
              {
                confidence: 0.4,
                match: {
                  artistName: "Wrong Artist",
                  confidence: 0.4,
                  id: "review-track",
                  name: "99 Problems",
                  reasons: ["Title-only match"],
                },
                query: "Jay-Z 99 Problems",
                reasons: ["Artist not confirmed"],
                segmentTitle: "99 Problems",
                status: "needs_review",
              },
            ],
            setlistSong: { artistName: "Jay-Z", name: "99 Problems", position: 2 },
            status: "needs_review",
          },
          {
            alternatives: [],
            confidence: 0,
            match: null,
            query: "Jay-Z Rare Cut",
            reasons: ["No confident Apple Music match"],
            selectedMatches: [],
            setlistSong: { artistName: "Jay-Z", name: "Rare Cut", position: 3 },
            status: "unmatched",
          },
        ]}
        initialFetchedSetlist={{
          artistName: "Jay-Z",
          id: "3b497c60",
          songs: [
            { artistName: "Jay-Z", name: "Encore", position: 1 },
            { artistName: "Jay-Z", name: "99 Problems", position: 2 },
            { artistName: "Jay-Z", name: "Rare Cut", position: 3 },
          ],
        }}
        initialParsedSetlist={{
          id: "3b497c60",
          url: "https://www.setlist.fm/setlist/jayz/2026/yankee-stadium-the-bronx-ny-3b497c60.html",
        }}
      />,
    );

    const matchList = () =>
      screen.getByRole("region", { name: /proposed apple music matches/i });
    const listSongs = () =>
      within(matchList())
        .getAllByRole("listitem")
        .filter((item) => item.parentElement?.className.includes("matchList"));

    // Defaults to Needs review when placeholders exist.
    expect(screen.getByRole("button", { name: /needs review/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(matchList()).getByText("Wrong Artist")).toBeInTheDocument();
    expect(within(matchList()).queryByText("Rare Cut")).not.toBeInTheDocument();
    expect(within(matchList()).queryByText(/jay-z ·/i)).not.toBeInTheDocument();
    expect(listSongs()).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /^unmatched/i }));
    expect(within(matchList()).getByText("Rare Cut")).toBeInTheDocument();
    expect(within(matchList()).getByText(/^no match$/i)).toBeInTheDocument();
    expect(within(matchList()).queryByText("Wrong Artist")).not.toBeInTheDocument();
    expect(listSongs()).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /^matched/i }));
    expect(within(matchList()).getByText(/100% confidence/i)).toBeInTheDocument();
    expect(within(matchList()).queryByText("Wrong Artist")).not.toBeInTheDocument();
    expect(within(matchList()).queryByText("Rare Cut")).not.toBeInTheDocument();
    expect(listSongs()).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /^all/i }));
    expect(within(matchList()).getByText("Wrong Artist")).toBeInTheDocument();
    expect(within(matchList()).getByText("Rare Cut")).toBeInTheDocument();
    expect(listSongs()).toHaveLength(3);

    // Playlist create uses the full match set, not the active filter.
    expect(screen.getByText(/1 matched track/i)).toBeInTheDocument();
  });

  it("lets the user search Apple Music and apply a match for an unmatched song", async () => {
    authMocks.getAppleMusicAuthorizationStatus.mockResolvedValue(true);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          tracks: [
            {
              albumName: "The Black Album",
              artistName: "JAY-Z",
              id: "search-track-1",
              name: "Encore",
            },
          ],
        }),
        { status: 200 },
      ),
    );

    render(
      <SetlistUrlForm
        initialAppleMusicMatches={[
          {
            alternatives: [],
            confidence: 0,
            match: null,
            query: "Jay-Z Encore",
            reasons: ["No confident Apple Music match"],
            selectedMatches: [],
            setlistSong: { artistName: "Jay-Z", name: "Encore", position: 1 },
            status: "unmatched",
          },
        ]}
        initialFetchedSetlist={{
          artistName: "Jay-Z",
          id: "3b497c60",
          songs: [{ artistName: "Jay-Z", name: "Encore", position: 1 }],
        }}
        initialParsedSetlist={{
          id: "3b497c60",
          url: "https://www.setlist.fm/setlist/jayz/2026/yankee-stadium-the-bronx-ny-3b497c60.html",
        }}
      />,
    );

    expect(screen.getByText(/0 matched tracks/i)).toBeInTheDocument();
    expect(screen.getByText(/^no match$/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/search apple music/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /find a match/i }));
    const searchInput = screen.getByLabelText(/search apple music/i);
    expect(searchInput).toHaveValue("");

    fireEvent.change(searchInput, { target: { value: "Jay-Z Encore" } });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /use this match/i })).toBeInTheDocument(),
    );
    expect(screen.getByText("The Black Album")).toBeInTheDocument();
    expect(screen.getByText("JAY-Z")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/apple-music/search",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ query: "Jay-Z Encore" }),
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: /use this match/i }));

    expect(screen.queryByText(/^no match$/i)).not.toBeInTheDocument();
    expect(screen.getByText(/1 matched track/i)).toBeInTheDocument();
    expect(screen.getByText(/jay-z · the black album/i)).toBeInTheDocument();
    expect(screen.getByText(/^updated$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^unmatched/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /find a match/i })).toBeInTheDocument();
  });

  it("searches Spotify when repairing matches for a Spotify destination", async () => {
    spotifyAuthMocks.getSpotifyAuthorizationStatus.mockResolvedValue({
      connected: true,
      displayName: "Listener",
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          tracks: [
            {
              albumName: "The Black Album",
              artistName: "JAY-Z",
              id: "spotifyTrack1",
              name: "Encore",
            },
          ],
        }),
        { status: 200 },
      ),
    );

    render(
      <SetlistUrlForm
        initialAppleMusicMatches={[
          {
            alternatives: [],
            confidence: 0,
            match: null,
            query: "Jay-Z Encore",
            reasons: ["No confident Spotify match"],
            selectedMatches: [],
            setlistSong: { artistName: "Jay-Z", name: "Encore", position: 1 },
            status: "unmatched",
          },
        ]}
        initialDestination="spotify"
        initialFetchedSetlist={{
          artistName: "Jay-Z",
          id: "3b497c60",
          songs: [{ artistName: "Jay-Z", name: "Encore", position: 1 }],
        }}
        initialParsedSetlist={{
          id: "3b497c60",
          url: "https://www.setlist.fm/setlist/jayz/2026/yankee-stadium-the-bronx-ny-3b497c60.html",
        }}
      />,
    );

    expect(screen.getByText(/search spotify to add this song/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /find a match/i }));
    const searchInput = screen.getByLabelText(/search spotify/i);
    fireEvent.change(searchInput, { target: { value: "Jay-Z Encore" } });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /use this match/i })).toBeInTheDocument(),
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/spotify/search",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ query: "Jay-Z Encore" }),
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: /use this match/i }));
    expect(screen.getByText(/1 matched track/i)).toBeInTheDocument();
    expect(screen.getByText(/jay-z · the black album/i)).toBeInTheDocument();
  });

  it("does not match Apple Music when authorization is denied", async () => {
    authMocks.authorizeAppleMusic.mockRejectedValue(
      new Error("Apple Music authorization was denied."),
    );
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    render(
      <SetlistUrlForm
        initialFetchedSetlist={{
          artistName: "Jay-Z",
          id: "3b497c60",
          songs: [{ artistName: "Jay-Z", name: "Encore", position: 1 }],
        }}
        initialParsedSetlist={{
          id: "3b497c60",
          url: "https://www.setlist.fm/setlist/jayz/2026/yankee-stadium-the-bronx-ny-3b497c60.html",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /match with apple music/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Apple Music authorization was denied.",
      ),
    );
    expect(fetchSpy).not.toHaveBeenCalledWith(
      "/api/apple-music/match",
      expect.anything(),
    );
  });

  it("skips Apple authorize when already connected, then matches", async () => {
    authMocks.getAppleMusicAuthorizationStatus.mockResolvedValue(true);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          matches: [
            {
              alternatives: [],
              confidence: 1,
              match: {
                artistName: "JAY-Z",
                confidence: 1,
                id: "apple-track-1",
                name: "Encore",
                reasons: ["Exact title match"],
              },
              query: "Jay-Z Encore",
              reasons: ["Exact title match"],
              selectedMatches: [],
              setlistSong: { artistName: "Jay-Z", name: "Encore", position: 1 },
              status: "matched",
            },
          ],
        }),
        { status: 200 },
      ),
    );

    render(
      <SetlistUrlForm
        initialFetchedSetlist={{
          artistName: "Jay-Z",
          id: "3b497c60",
          songs: [{ artistName: "Jay-Z", name: "Encore", position: 1 }],
        }}
        initialParsedSetlist={{
          id: "3b497c60",
          url: "https://www.setlist.fm/setlist/jayz/2026/yankee-stadium-the-bronx-ny-3b497c60.html",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /match with apple music/i }));

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /review and create/i })).toBeInTheDocument(),
    );
    expect(authMocks.authorizeAppleMusic).not.toHaveBeenCalled();
  });

  it("renders multiple selected tracks for a multi-title setlist entry", () => {
    render(
      <SetlistUrlForm
        initialAppleMusicMatches={[
          {
            alternatives: [],
            confidence: 0.98,
            match: {
              albumName: "The Blueprint",
              artistName: "JAY-Z",
              confidence: 1,
              id: "girls-track",
              name: "Girls, Girls, Girls",
              reasons: ["Exact title match", "Artist match"],
            },
            query: "Jay-Z Girls, Girls, Girls / '03 Bonnie & Clyde",
            reasons: ["Matched 2 title segments"],
            selectedMatches: [
              {
                confidence: 1,
                match: {
                  albumName: "The Blueprint",
                  artistName: "JAY-Z",
                  confidence: 1,
                  id: "girls-track",
                  name: "Girls, Girls, Girls",
                  reasons: ["Exact title match", "Artist match"],
                },
                query: "Jay-Z Girls, Girls, Girls / '03 Bonnie & Clyde",
                reasons: ["Exact title match", "Artist match"],
                segmentTitle: "Girls, Girls, Girls",
              status: "matched",
              },
              {
                confidence: 0.96,
                match: {
                  albumName: "The Blueprint 2",
                  artistName: "JAY-Z",
                  confidence: 0.96,
                  id: "bonnie-track",
                  name: "'03 Bonnie & Clyde (feat. Beyoncé Knowles)",
                  reasons: ["Exact title match", "Artist match"],
                },
                query: "Jay-Z '03 Bonnie & Clyde",
                reasons: ["Exact title match", "Artist match"],
                segmentTitle: "'03 Bonnie & Clyde",
              status: "matched",
              },
            ],
            setlistSong: {
              artistName: "Jay-Z",
              name: "Girls, Girls, Girls / '03 Bonnie & Clyde",
              position: 1,
            },
            status: "matched",
          },
        ]}
      />,
    );

    expect(screen.getByText("Selected tracks")).toBeInTheDocument();
    expect(screen.getAllByText("Girls, Girls, Girls")).toHaveLength(2);
    expect(screen.getByText("'03 Bonnie & Clyde (feat. Beyoncé Knowles)")).toBeInTheDocument();
  });

  it("keeps needs-review placeholders out of the playlist until opted in", async () => {
    authMocks.getAppleMusicAuthorizationStatus.mockResolvedValue(true);
    authMocks.createAppleMusicPlaylist.mockResolvedValue({
      id: "p.playlist",
      name: "Mereba · Review",
      trackCount: 1,
    });

    render(
      <SetlistUrlForm
        initialAppleMusicMatches={[
          {
            alternatives: [],
            confidence: 1,
            match: {
              artistName: "Sam Cooke",
              confidence: 1,
              id: "you-send-me-track",
              name: "You Send Me",
              reasons: ["Needs review", "Popular title match — artist not confirmed"],
            },
            query: "You Send Me",
            reasons: ["Needs review", "Popular title match — artist not confirmed"],
            selectedMatches: [
              {
                confidence: 1,
                match: {
                  artistName: "Sam Cooke",
                  confidence: 1,
                  id: "you-send-me-track",
                  name: "You Send Me",
                  reasons: ["Needs review", "Popular title match — artist not confirmed"],
                },
                query: "You Send Me",
                reasons: ["Needs review", "Popular title match — artist not confirmed"],
                segmentTitle: "You Send Me",
                status: "needs_review",
              },
            ],
            setlistSong: {
              artistName: "Mereba",
              name: "You Send Me",
              position: 1,
            },
            status: "needs_review",
          },
        ]}
        initialFetchedSetlist={{
          artistName: "Mereba",
          id: "6b585e1a",
          songs: [{ artistName: "Mereba", name: "You Send Me", position: 1 }],
        }}
        initialSetlistUrl="https://www.setlist.fm/setlist/mereba/2025/koko-london-england-6b585e1a.html"
      />,
    );

    expect(screen.getByText(/artist may be wrong/i)).toBeInTheDocument();
    expect(screen.getByText(/1 item needs review/i)).toBeInTheDocument();
    expect(screen.getByText(/0 matched tracks/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create Apple Music playlist" }),
    ).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /include anyway/i }));

    expect(screen.getByText(/^updated$/i)).toBeInTheDocument();
    expect(screen.getByText(/1 matched track/i)).toBeInTheDocument();
    expect(screen.queryByText(/artist may be wrong/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /find a match/i })).toBeInTheDocument();

    const createButton = screen.getByRole("button", {
      name: "Create Apple Music playlist",
    });
    await waitFor(() => expect(createButton).toBeEnabled());
    fireEvent.click(createButton);

    await waitFor(() => expect(authMocks.createAppleMusicPlaylist).toHaveBeenCalled());
    expect(authMocks.createAppleMusicPlaylist).toHaveBeenCalledWith({
      description: "Created from a setlist.fm setlist by Setlist Playlist.",
      name: "Mereba · Setlist",
      tracks: [{ id: "you-send-me-track", type: "songs" }],
    });
  });

  it("creates an authorized playlist from reviewed matches", async () => {
    authMocks.getAppleMusicAuthorizationStatus.mockResolvedValue(true);
    authMocks.createAppleMusicPlaylist.mockResolvedValue({
      id: "p.playlist",
      name: "Jay-Z · Yankee Stadium · 13-07-2026",
      trackCount: 1,
      url: "https://music.apple.com/library/playlist/p.playlist",
    });

    render(
      <SetlistUrlForm
        initialAppleMusicMatches={[
          {
            alternatives: [],
            confidence: 1,
            match: {
              artistName: "JAY-Z",
              confidence: 1,
              id: "encore-track",
              name: "Encore",
              reasons: ["Exact title match", "Artist match"],
            },
            query: "Jay-Z Encore",
            reasons: ["Exact title match", "Artist match"],
            selectedMatches: [
              {
                confidence: 1,
                match: {
                  artistName: "JAY-Z",
                  confidence: 1,
                  id: "encore-track",
                  name: "Encore",
                  reasons: ["Exact title match", "Artist match"],
                },
                query: "Jay-Z Encore",
                reasons: ["Exact title match", "Artist match"],
                segmentTitle: "Encore",
              status: "matched",
              },
            ],
            setlistSong: {
              artistName: "Jay-Z",
              name: "Encore",
              position: 1,
            },
            status: "matched",
          },
        ]}
        initialFetchedSetlist={{
          artistName: "Jay-Z",
          eventDate: "13-07-2026",
          id: "3b497c60",
          songs: [{ artistName: "Jay-Z", name: "Encore", position: 1 }],
          venue: { name: "Yankee Stadium" },
        }}
      />,
    );

    const createButton = screen.getByRole("button", {
      name: "Create Apple Music playlist",
    });
    await waitFor(() => expect(createButton).toBeEnabled());
    fireEvent.click(createButton);

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /playlist created/i }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText("Jay-Z · Yankee Stadium · 13-07-2026 was created"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open playlist/i })).toHaveAttribute(
      "href",
      "https://music.apple.com/library/playlist/p.playlist",
    );
    expect(screen.getByRole("button", { name: "Load another setlist" })).toBeInTheDocument();
    expect(authMocks.createAppleMusicPlaylist).toHaveBeenCalledWith({
      description: "Created from a setlist.fm setlist by Setlist Playlist.",
      name: "Jay-Z · Yankee Stadium · 13-07-2026",
      tracks: [{ id: "encore-track", type: "songs" }],
    });
  });

  it("creates an authorized Spotify playlist from reviewed matches", async () => {
    spotifyAuthMocks.getSpotifyAuthorizationStatus.mockResolvedValue({
      connected: true,
      displayName: "Listener",
    });
    spotifyAuthMocks.createSpotifyPlaylist.mockResolvedValue({
      id: "playlist-1",
      name: "Jay-Z · Yankee Stadium · 13-07-2026",
      trackCount: 1,
      url: "https://open.spotify.com/playlist/playlist-1",
    });

    render(
      <SetlistUrlForm
        initialAppleMusicMatches={[
          {
            alternatives: [],
            confidence: 1,
            match: {
              artistName: "JAY-Z",
              confidence: 1,
              id: "spotifyTrack1",
              name: "Encore",
              reasons: ["Exact title match", "Artist match"],
            },
            query: "Jay-Z Encore",
            reasons: ["Exact title match", "Artist match"],
            selectedMatches: [
              {
                confidence: 1,
                match: {
                  artistName: "JAY-Z",
                  confidence: 1,
                  id: "spotifyTrack1",
                  name: "Encore",
                  reasons: ["Exact title match", "Artist match"],
                },
                query: "Jay-Z Encore",
                reasons: ["Exact title match", "Artist match"],
                segmentTitle: "Encore",
                status: "matched",
              },
            ],
            setlistSong: {
              artistName: "Jay-Z",
              name: "Encore",
              position: 1,
            },
            status: "matched",
          },
        ]}
        initialDestination="spotify"
        initialFetchedSetlist={{
          artistName: "Jay-Z",
          eventDate: "13-07-2026",
          id: "3b497c60",
          songs: [{ artistName: "Jay-Z", name: "Encore", position: 1 }],
          venue: { name: "Yankee Stadium" },
        }}
      />,
    );

    const createButton = screen.getByRole("button", {
      name: "Create Spotify playlist",
    });
    await waitFor(() => expect(createButton).toBeEnabled());
    fireEvent.click(createButton);

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /playlist created/i }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText("Jay-Z · Yankee Stadium · 13-07-2026 was created"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open playlist/i })).toHaveAttribute(
      "href",
      "https://open.spotify.com/playlist/playlist-1",
    );
    expect(screen.getByRole("button", { name: "Load another setlist" })).toBeInTheDocument();
    expect(spotifyAuthMocks.createSpotifyPlaylist).toHaveBeenCalledWith({
      description: "Created from a setlist.fm setlist by Setlist Playlist.",
      name: "Jay-Z · Yankee Stadium · 13-07-2026",
      uris: ["spotify:track:spotifyTrack1"],
    });
    expect(authMocks.createAppleMusicPlaylist).not.toHaveBeenCalled();
  });

  it("shows a dedicated failure page when playlist creation fails", async () => {
    authMocks.getAppleMusicAuthorizationStatus.mockResolvedValue(true);
    authMocks.createAppleMusicPlaylist.mockRejectedValue(
      new Error("Unable to create the Apple Music playlist."),
    );

    render(
      <SetlistUrlForm
        initialAppleMusicMatches={[
          {
            alternatives: [],
            confidence: 1,
            match: {
              artistName: "JAY-Z",
              confidence: 1,
              id: "encore-track",
              name: "Encore",
              reasons: ["Exact title match", "Artist match"],
            },
            query: "Jay-Z Encore",
            reasons: ["Exact title match", "Artist match"],
            selectedMatches: [
              {
                confidence: 1,
                match: {
                  artistName: "JAY-Z",
                  confidence: 1,
                  id: "encore-track",
                  name: "Encore",
                  reasons: ["Exact title match", "Artist match"],
                },
                query: "Jay-Z Encore",
                reasons: ["Exact title match", "Artist match"],
                segmentTitle: "Encore",
                status: "matched",
              },
            ],
            setlistSong: {
              artistName: "Jay-Z",
              name: "Encore",
              position: 1,
            },
            status: "matched",
          },
        ]}
        initialFetchedSetlist={{
          artistName: "Jay-Z",
          eventDate: "13-07-2026",
          id: "3b497c60",
          songs: [{ artistName: "Jay-Z", name: "Encore", position: 1 }],
          venue: { name: "Yankee Stadium" },
        }}
      />,
    );

    const createButton = screen.getByRole("button", {
      name: "Create Apple Music playlist",
    });
    await waitFor(() => expect(createButton).toBeEnabled());
    fireEvent.click(createButton);

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /playlist not created/i }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Unable to create the Apple Music playlist.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      screen.getByRole("heading", { name: /review and create/i }),
    ).toBeInTheDocument();
  });
});
