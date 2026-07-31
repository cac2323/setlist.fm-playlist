import "server-only";

import { z } from "zod";

import { apiDebug } from "./debug";
import { SpotifyApiError } from "./spotify";

const SPOTIFY_TRACK_URI_BATCH_SIZE = 100;

const createdPlaylistResponseSchema = z.object({
  external_urls: z
    .object({
      spotify: z.string().optional(),
    })
    .optional(),
  id: z.string().min(1),
  name: z.string().optional(),
});

function chunkUris(uris: string[]) {
  const chunks: string[][] = [];

  for (let index = 0; index < uris.length; index += SPOTIFY_TRACK_URI_BATCH_SIZE) {
    chunks.push(uris.slice(index, index + SPOTIFY_TRACK_URI_BATCH_SIZE));
  }

  return chunks;
}

async function spotifyJsonRequest<T>(options: {
  accessToken: string;
  body?: unknown;
  method: "GET" | "POST";
  schema: z.ZodType<T>;
  url: string;
}) {
  let response: Response;

  try {
    response = await fetch(options.url, {
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${options.accessToken}`,
        ...(options.body === undefined
          ? {}
          : { "Content-Type": "application/json" }),
      },
      method: options.method,
    });
  } catch (error) {
    apiDebug("Spotify playlist request network failure", {
      errorMessage: error instanceof Error ? error.message : "Unknown error",
      method: options.method,
      url: options.url,
    });
    throw new SpotifyApiError("Unable to reach Spotify playlist API.");
  }

  const responseBody: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    apiDebug("Spotify playlist request failed", {
      method: options.method,
      requestBody: options.body,
      responseBody,
      status: response.status,
      statusText: response.statusText,
      url: options.url,
    });

    if (response.status === 403) {
      throw new SpotifyApiError(
        "Spotify denied playlist creation. Confirm the Spotify app owner has Premium and try reconnecting.",
      );
    }

    if (response.status === 401) {
      throw new SpotifyApiError(
        "Spotify denied playlist creation. Reconnect Spotify and try again.",
      );
    }

    throw new SpotifyApiError("Unable to create the Spotify playlist.");
  }

  const parsed = options.schema.safeParse(responseBody);

  if (!parsed.success) {
    apiDebug("Spotify playlist response validation failed", {
      issues: parsed.error.issues,
      method: options.method,
      responseBody,
      url: options.url,
    });
    throw new SpotifyApiError("Spotify returned an unexpected playlist response.");
  }

  return parsed.data;
}

export async function createSpotifyPlaylist(options: {
  accessToken: string;
  description: string;
  name: string;
  uris: string[];
}) {
  if (options.uris.length === 0) {
    throw new SpotifyApiError("Add at least one matched track before creating a playlist.");
  }

  const playlist = await spotifyJsonRequest({
    accessToken: options.accessToken,
    body: {
      description: options.description,
      name: options.name,
      public: false,
    },
    method: "POST",
    schema: createdPlaylistResponseSchema,
    url: "https://api.spotify.com/v1/me/playlists",
  });

  for (const uris of chunkUris(options.uris)) {
    await spotifyJsonRequest({
      accessToken: options.accessToken,
      body: { uris },
      method: "POST",
      schema: z.object({}).passthrough(),
      url: `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlist.id)}/tracks`,
    });
  }

  return {
    id: playlist.id,
    name: playlist.name ?? options.name,
    trackCount: options.uris.length,
    url: playlist.external_urls?.spotify,
  };
}
