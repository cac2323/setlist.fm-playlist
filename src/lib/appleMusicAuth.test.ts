import { afterEach, describe, expect, it, vi } from "vitest";

type TestMusicKitInstance = {
  api: {
    music: ReturnType<typeof vi.fn>;
  };
  authorize: ReturnType<typeof vi.fn>;
  isAuthorized: boolean;
  unauthorize: ReturnType<typeof vi.fn>;
};

function setMusicKit(instance: TestMusicKitInstance) {
  const configure = vi.fn().mockResolvedValue(instance);

  Object.defineProperty(window, "MusicKit", {
    configurable: true,
    value: { configure },
  });

  return configure;
}

describe("Apple Music authorization client", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "MusicKit");
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("configures MusicKit and authorizes without exposing the user token", async () => {
    const instance: TestMusicKitInstance = {
      api: { music: vi.fn() },
      authorize: vi.fn().mockResolvedValue("music-user-token"),
      isAuthorized: false,
      unauthorize: vi.fn(),
    };
    const configure = setMusicKit(instance);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ developerToken: "developer-token" }), {
        status: 200,
      }),
    );
    const { authorizeAppleMusic } = await import("./appleMusicAuth");

    await expect(authorizeAppleMusic()).resolves.toBe(true);
    expect(configure).toHaveBeenCalledWith({
      app: {
        build: "0.1.0",
        name: "Setlist Playlist",
      },
      developerToken: "developer-token",
    });
    expect(instance.authorize).toHaveBeenCalledOnce();
  });

  it("propagates an Apple Music authorization denial", async () => {
    setMusicKit({
      api: { music: vi.fn() },
      authorize: vi.fn().mockRejectedValue(new Error("Authorization denied")),
      isAuthorized: false,
      unauthorize: vi.fn(),
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ developerToken: "developer-token" }), {
        status: 200,
      }),
    );
    const { authorizeAppleMusic } = await import("./appleMusicAuth");

    await expect(authorizeAppleMusic()).rejects.toThrow("Authorization denied");
  });

  it("rejects an invalid developer token response before configuring MusicKit", async () => {
    const configure = setMusicKit({
      api: { music: vi.fn() },
      authorize: vi.fn(),
      isAuthorized: false,
      unauthorize: vi.fn(),
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ unexpected: true }), { status: 200 }),
    );
    const { getAppleMusicAuthorizationStatus } = await import("./appleMusicAuth");

    await expect(getAppleMusicAuthorizationStatus()).rejects.toThrow(
      "Apple Music authorization returned an unexpected response.",
    );
    expect(configure).not.toHaveBeenCalled();
  });

  it("creates an authorized Apple Music playlist with catalog songs", async () => {
    setMusicKit({
      api: { music: vi.fn() },
      authorize: vi.fn(),
      isAuthorized: true,
      musicUserToken: "music-user-token",
      unauthorize: vi.fn(),
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);

      if (url === "/api/apple-music/token") {
        return Promise.resolve(
          new Response(JSON.stringify({ developerToken: "developer-token" }), {
            status: 200,
          }),
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: [
              {
                attributes: { name: "Jay-Z · Yankee Stadium" },
                id: "p.playlist",
                type: "library-playlists",
              },
            ],
          }),
          { status: 201 },
        ),
      );
    });
    const { createAppleMusicPlaylist } = await import("./appleMusicAuth");

    await expect(
      createAppleMusicPlaylist({
        description: "Created from setlist.fm.",
        name: "Jay-Z · Yankee Stadium",
        tracks: [
          { id: "song-1", type: "songs" },
          { id: "song-2", type: "songs" },
        ],
      }),
    ).resolves.toEqual({
      id: "p.playlist",
      name: "Jay-Z · Yankee Stadium",
      trackCount: 2,
      url: "https://music.apple.com/library/playlist/p.playlist",
    });
    const appleRequest = fetchMock.mock.calls.find(
      ([input]) => String(input) === "https://api.music.apple.com/v1/me/library/playlists",
    );

    expect(appleRequest).toBeDefined();
    if (!appleRequest) {
      throw new Error("Expected an Apple Music API request.");
    }

    expect(appleRequest[1]).toMatchObject({ method: "POST" });
    expect(JSON.parse(String(appleRequest[1]?.body))).toMatchObject({
      attributes: {
        name: "Jay-Z · Yankee Stadium",
      },
      relationships: {
        tracks: {
          data: [
            { id: "song-1", type: "songs" },
            { id: "song-2", type: "songs" },
          ],
        },
      },
    });
  });

  it("blocks playlist creation when Apple Music is not authorized", async () => {
    const music = vi.fn();
    setMusicKit({
      api: { music },
      authorize: vi.fn(),
      isAuthorized: false,
      unauthorize: vi.fn(),
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ developerToken: "developer-token" }), {
        status: 200,
      }),
    );
    const { createAppleMusicPlaylist } = await import("./appleMusicAuth");

    await expect(
      createAppleMusicPlaylist({
        description: "Created from setlist.fm.",
        name: "Setlist",
        tracks: [{ id: "song-1", type: "songs" }],
      }),
    ).rejects.toThrow("Connect Apple Music before creating a playlist.");
    expect(music).not.toHaveBeenCalled();
  });

  it("returns a stable error when the MusicKit playlist request fails", async () => {
    setMusicKit({
      api: { music: vi.fn() },
      authorize: vi.fn(),
      isAuthorized: true,
      musicUserToken: "music-user-token",
      unauthorize: vi.fn(),
    });
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);

      if (url === "/api/apple-music/token") {
        return Promise.resolve(
          new Response(JSON.stringify({ developerToken: "developer-token" }), {
            status: 200,
          }),
        );
      }

      return Promise.resolve(
        new Response(JSON.stringify({ errors: [{ detail: "Rejected" }] }), {
          status: 400,
        }),
      );
    });
    const { createAppleMusicPlaylist } = await import("./appleMusicAuth");

    await expect(
      createAppleMusicPlaylist({
        description: "Created from setlist.fm.",
        name: "Setlist",
        tracks: [{ id: "song-1", type: "songs" }],
      }),
    ).rejects.toThrow("Unable to create the Apple Music playlist.");
  });

  it("prefers a catalog globalId when building the Apple Music playlist URL", async () => {
    setMusicKit({
      api: { music: vi.fn() },
      authorize: vi.fn(),
      isAuthorized: true,
      musicUserToken: "music-user-token",
      unauthorize: vi.fn(),
    });
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);

      if (url === "/api/apple-music/token") {
        return Promise.resolve(
          new Response(JSON.stringify({ developerToken: "developer-token" }), {
            status: 200,
          }),
        );
      }

      if (url.includes("/v1/me/library/playlists/p.playlist")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: [
                {
                  attributes: {
                    name: "Jay-Z · Yankee Stadium",
                    playParams: {
                      globalId: "pl.global-123",
                      id: "p.playlist",
                    },
                  },
                  id: "p.playlist",
                  type: "library-playlists",
                },
              ],
            }),
            { status: 200 },
          ),
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: [
              {
                attributes: { name: "Jay-Z · Yankee Stadium" },
                id: "p.playlist",
                type: "library-playlists",
              },
            ],
          }),
          { status: 201 },
        ),
      );
    });
    const { createAppleMusicPlaylist } = await import("./appleMusicAuth");

    await expect(
      createAppleMusicPlaylist({
        description: "Created from setlist.fm.",
        name: "Jay-Z · Yankee Stadium",
        tracks: [{ id: "song-1", type: "songs" }],
      }),
    ).resolves.toEqual({
      id: "p.playlist",
      name: "Jay-Z · Yankee Stadium",
      trackCount: 1,
      url: "https://music.apple.com/playlist/pl.global-123",
    });
  });
});
