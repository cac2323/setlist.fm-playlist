import { z } from "zod";

import { clientDebug } from "./debug";

const statusResponseSchema = z.object({
  connected: z.boolean(),
  displayName: z.string().optional(),
});

const createdPlaylistResponseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  trackCount: z.number().int().nonnegative(),
  url: z.string().optional(),
});

const AUTHORIZATION_CHANGE_EVENT = "setlist-playlist:spotify-authorization-change";

export class SpotifyClientAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpotifyClientAuthError";
  }
}

export class SpotifyClientPlaylistError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpotifyClientPlaylistError";
  }
}

function emitAuthorizationChange(isAuthorized: boolean) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<boolean>(AUTHORIZATION_CHANGE_EVENT, {
        detail: isAuthorized,
      }),
    );
  }
}

export function subscribeToSpotifyAuthorization(listener: (isAuthorized: boolean) => void) {
  const handler = (event: Event) => {
    listener(Boolean((event as CustomEvent<boolean>).detail));
  };

  window.addEventListener(AUTHORIZATION_CHANGE_EVENT, handler);
  return () => window.removeEventListener(AUTHORIZATION_CHANGE_EVENT, handler);
}

export async function getSpotifyAuthorizationStatus() {
  const url = "/api/spotify/auth/status";
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const responseBody: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    clientDebug("Spotify authorization status failed", {
      method: "GET",
      responseBody,
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
        : "Unable to check Spotify authorization.";

    throw new SpotifyClientAuthError(message);
  }

  const parsed = statusResponseSchema.safeParse(responseBody);

  if (!parsed.success) {
    throw new SpotifyClientAuthError("Unexpected Spotify authorization status response.");
  }

  return parsed.data;
}

export function beginSpotifyAuthorization() {
  // Spotify redirect URI is 127.0.0.1 (localhost cookies won't be sent back).
  const loginUrl = new URL("/api/spotify/auth/login", window.location.href);
  if (loginUrl.hostname === "localhost") {
    loginUrl.hostname = "127.0.0.1";
  }
  window.location.assign(loginUrl.toString());
}

export async function unauthorizeSpotify() {
  const url = "/api/spotify/auth/logout";
  const response = await fetch(url, {
    method: "POST",
    headers: { Accept: "application/json" },
  });
  const responseBody: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    clientDebug("Spotify logout failed", {
      method: "POST",
      responseBody,
      status: response.status,
      statusText: response.statusText,
      url,
    });
    throw new SpotifyClientAuthError("Unable to disconnect Spotify.");
  }

  emitAuthorizationChange(false);
}

export async function createSpotifyPlaylist(input: {
  description: string;
  name: string;
  uris: string[];
}) {
  const url = "/api/spotify/playlist";
  const response = await fetch(url, {
    body: JSON.stringify(input),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const responseBody: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    clientDebug("Spotify playlist creation failed", {
      method: "POST",
      requestBody: input,
      responseBody,
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
        : "Unable to create the Spotify playlist.";

    if (response.status === 401) {
      emitAuthorizationChange(false);
    }

    throw new SpotifyClientPlaylistError(message);
  }

  const parsed = createdPlaylistResponseSchema.safeParse(responseBody);

  if (!parsed.success) {
    clientDebug("Spotify playlist response validation failed", {
      issues: parsed.error.issues,
      method: "POST",
      requestBody: input,
      responseBody,
      url,
    });
    throw new SpotifyClientPlaylistError(
      "Spotify returned an unexpected playlist response.",
    );
  }

  return parsed.data;
}
