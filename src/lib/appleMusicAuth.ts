import { z } from "zod";

import { clientDebug } from "./debug";
import { redactForLog } from "./redactForLog";

const developerTokenResponseSchema = z.object({
  developerToken: z.string().min(1),
});
const createdPlaylistResponseSchema = z.object({
  data: z
    .array(
      z.object({
        attributes: z
          .object({
            name: z.string().optional(),
            playParams: z
              .object({
                globalId: z.string().optional(),
                id: z.string().optional(),
              })
              .optional(),
          })
          .optional(),
        id: z.string(),
        type: z.literal("library-playlists"),
      }),
    )
    .min(1),
});

function buildAppleMusicPlaylistUrl(options: {
  globalId?: string;
  id: string;
}) {
  if (options.globalId) {
    return `https://music.apple.com/playlist/${options.globalId}`;
  }

  return `https://music.apple.com/library/playlist/${encodeURIComponent(options.id)}`;
}

const MUSIC_KIT_SCRIPT_ID = "apple-musickit-js";
const MUSIC_KIT_SCRIPT_URL = "https://js-cdn.music.apple.com/musickit/v3/musickit.js";
const AUTHORIZATION_CHANGE_EVENT = "setlist-playlist:apple-music-authorization-change";

type MusicKitInstance = {
  authorize(): Promise<string>;
  isAuthorized: boolean;
  musicUserToken?: string;
  unauthorize(): Promise<unknown>;
};

type MusicKitNamespace = {
  configure(configuration: {
    app: {
      build: string;
      name: string;
    };
    developerToken: string;
  }): MusicKitInstance | Promise<MusicKitInstance>;
};

declare global {
  interface Window {
    MusicKit?: MusicKitNamespace;
  }
}

let musicKitNamespacePromise: Promise<MusicKitNamespace> | null = null;
let musicKitInstancePromise: Promise<MusicKitInstance> | null = null;
let authorizedMusicUserToken: string | null = null;

function emitAuthorizationChange(isAuthorized: boolean) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<boolean>(AUTHORIZATION_CHANGE_EVENT, {
        detail: isAuthorized,
      }),
    );
  }
}

export class AppleMusicAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppleMusicAuthorizationError";
  }
}

export class AppleMusicPlaylistError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppleMusicPlaylistError";
  }
}

async function fetchDeveloperToken() {
  const url = "/api/apple-music/token";
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });
  const responseBody: unknown = await response.json();

  if (!response.ok) {
    clientDebug("Apple Music developer token request failed", {
      method: "GET",
      responseBody: redactForLog(responseBody),
      status: response.status,
      statusText: response.statusText,
      url,
    });

    const message =
      responseBody &&
      typeof responseBody === "object" &&
      "error" in responseBody &&
      typeof responseBody.error === "string"
        ? responseBody.error
        : "Unable to configure Apple Music authorization.";

    throw new AppleMusicAuthorizationError(message);
  }

  const parsedResponse = developerTokenResponseSchema.safeParse(responseBody);

  if (!parsedResponse.success) {
    clientDebug("Apple Music developer token response validation failed", {
      issues: parsedResponse.error.issues,
      method: "GET",
      responseBodyKeys:
        responseBody && typeof responseBody === "object" ? Object.keys(responseBody) : [],
      status: response.status,
      url,
    });

    throw new AppleMusicAuthorizationError(
      "Apple Music authorization returned an unexpected response.",
    );
  }

  return parsedResponse.data.developerToken;
}

function loadMusicKit() {
  if (typeof window === "undefined") {
    return Promise.reject(
      new AppleMusicAuthorizationError("Apple Music authorization requires a browser."),
    );
  }

  if (window.MusicKit) {
    return Promise.resolve(window.MusicKit);
  }

  if (musicKitNamespacePromise) {
    return musicKitNamespacePromise;
  }

  musicKitNamespacePromise = new Promise<MusicKitNamespace>((resolve, reject) => {
    function handleLoaded() {
      if (!window.MusicKit) {
        reject(new AppleMusicAuthorizationError("MusicKit loaded without an API."));
        return;
      }

      resolve(window.MusicKit);
    }

    document.addEventListener("musickitloaded", handleLoaded, { once: true });

    const existingScript = document.getElementById(MUSIC_KIT_SCRIPT_ID);

    if (existingScript) {
      existingScript.addEventListener(
        "error",
        () => reject(new AppleMusicAuthorizationError("Unable to load MusicKit.")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.id = MUSIC_KIT_SCRIPT_ID;
    script.src = MUSIC_KIT_SCRIPT_URL;
    script.async = true;
    script.addEventListener(
      "error",
      () => reject(new AppleMusicAuthorizationError("Unable to load MusicKit.")),
      { once: true },
    );
    document.head.append(script);
  }).catch((error) => {
    musicKitNamespacePromise = null;
    throw error;
  });

  return musicKitNamespacePromise;
}

async function getMusicKitInstance() {
  if (!musicKitInstancePromise) {
    musicKitInstancePromise = Promise.all([loadMusicKit(), fetchDeveloperToken()])
      .then(([MusicKit, developerToken]) =>
        MusicKit.configure({
          app: {
            build: "0.1.0",
            name: "Setlist Playlist",
          },
          developerToken,
        }),
      )
      .catch((error) => {
        clientDebug("Apple MusicKit configuration failed", {
          errorMessage: error instanceof Error ? error.message : "Unknown error",
          errorName: error instanceof Error ? error.name : "Unknown",
          stage: "configure",
        });
        musicKitInstancePromise = null;
        throw error;
      });
  }

  return musicKitInstancePromise;
}

export async function getAppleMusicAuthorizationStatus() {
  const music = await getMusicKitInstance();
  return music.isAuthorized;
}

export function subscribeToAppleMusicAuthorization(
  listener: (isAuthorized: boolean) => void,
) {
  function handleAuthorizationChange(event: Event) {
    listener((event as CustomEvent<boolean>).detail);
  }

  window.addEventListener(AUTHORIZATION_CHANGE_EVENT, handleAuthorizationChange);

  return () => {
    window.removeEventListener(AUTHORIZATION_CHANGE_EVENT, handleAuthorizationChange);
  };
}

export async function authorizeAppleMusic() {
  const music = await getMusicKitInstance();

  try {
    const musicUserToken = await music.authorize();

    if (!musicUserToken) {
      throw new AppleMusicAuthorizationError("Apple Music did not return user authorization.");
    }

    authorizedMusicUserToken = musicUserToken;
    emitAuthorizationChange(true);
    return true;
  } catch (error) {
    clientDebug("Apple Music user authorization failed", {
      errorMessage: error instanceof Error ? error.message : "Unknown error",
      errorName: error instanceof Error ? error.name : "Unknown",
      stage: "authorize",
    });
    throw error;
  }
}

export async function unauthorizeAppleMusic() {
  const music = await getMusicKitInstance();

  try {
    await music.unauthorize();
    authorizedMusicUserToken = null;
    emitAuthorizationChange(false);
  } catch (error) {
    clientDebug("Apple Music user unauthorization failed", {
      errorMessage: error instanceof Error ? error.message : "Unknown error",
      errorName: error instanceof Error ? error.name : "Unknown",
      stage: "unauthorize",
    });
    throw error;
  }
}

export async function createAppleMusicPlaylist(input: {
  description: string;
  name: string;
  tracks: Array<{
    id: string;
    type: "songs";
  }>;
}) {
  const music = await getMusicKitInstance();
  const path = "/v1/me/library/playlists";
  const requestBody = {
    attributes: {
      description: input.description,
      isPublic: false,
      name: input.name,
    },
    relationships: {
      tracks: {
        data: input.tracks,
      },
    },
  };

  if (!music.isAuthorized) {
    throw new AppleMusicPlaylistError("Connect Apple Music before creating a playlist.");
  }

  const musicUserToken = authorizedMusicUserToken ?? music.musicUserToken;

  if (!musicUserToken) {
    throw new AppleMusicPlaylistError(
      "Reconnect Apple Music before creating a playlist.",
    );
  }

  try {
    const developerToken = await fetchDeveloperToken();
    const response = await fetch(`https://api.music.apple.com${path}`, {
      body: JSON.stringify(requestBody),
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${developerToken}`,
        "Content-Type": "application/json",
        "Music-User-Token": musicUserToken,
      },
      method: "POST",
    });
    const responseData: unknown = await response.json();

    if (!response.ok) {
      clientDebug("Apple Music direct playlist request failed", {
        method: "POST",
        path,
        requestBody: redactForLog(requestBody),
        responseBody: redactForLog(responseData),
        status: response.status,
        statusText: response.statusText,
      });

      throw new AppleMusicPlaylistError("Unable to create the Apple Music playlist.");
    }
    const parsedResponse = createdPlaylistResponseSchema.safeParse(responseData);

    if (!parsedResponse.success) {
      clientDebug("Apple Music create playlist response validation failed", {
        issues: redactForLog(parsedResponse.error.issues),
        method: "POST",
        path,
        requestBody: redactForLog(requestBody),
        responseBody: redactForLog(responseData),
      });

      throw new AppleMusicPlaylistError(
        "Apple Music returned an unexpected playlist response.",
      );
    }

    const playlist = parsedResponse.data.data[0];
    let globalId = playlist.attributes?.playParams?.globalId;

    if (!globalId) {
      try {
        const detailResponse = await fetch(
          `https://api.music.apple.com/v1/me/library/playlists/${encodeURIComponent(playlist.id)}`,
          {
            headers: {
              Accept: "application/json",
              Authorization: `Bearer ${developerToken}`,
              "Music-User-Token": musicUserToken,
            },
            method: "GET",
          },
        );
        const detailBody: unknown = await detailResponse.json().catch(() => null);
        if (detailResponse.ok) {
          const parsedDetail = createdPlaylistResponseSchema.safeParse(detailBody);
          if (parsedDetail.success) {
            globalId = parsedDetail.data.data[0]?.attributes?.playParams?.globalId;
          }
        }
      } catch (detailError) {
        clientDebug("Apple Music playlist detail lookup failed", {
          errorMessage:
            detailError instanceof Error ? detailError.message : "Unknown error",
          playlistId: playlist.id,
        });
      }
    }

    return {
      id: playlist.id,
      name: playlist.attributes?.name ?? input.name,
      trackCount: input.tracks.length,
      url: buildAppleMusicPlaylistUrl({ globalId, id: playlist.id }),
    };
  } catch (error) {
    clientDebug("Apple Music playlist creation failed", {
      errorMessage: error instanceof Error ? error.message : "Unknown error",
      errorName: error instanceof Error ? error.name : "Unknown",
      method: "POST",
      path,
      requestBody: redactForLog(requestBody),
      responseBody: redactForLog(
        error && typeof error === "object" && "response" in error ? error.response : undefined,
      ),
    });

    if (error instanceof AppleMusicPlaylistError) {
      throw error;
    }

    throw new AppleMusicPlaylistError("Unable to create the Apple Music playlist.");
  }
}
