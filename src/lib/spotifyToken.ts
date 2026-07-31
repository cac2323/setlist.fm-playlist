import "server-only";

import { z } from "zod";

import { apiDebug } from "./debug";
import { redactForLog } from "./redactForLog";
import { getSpotifyAuthConfig } from "./spotifyAuth";

const clientCredentialsResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  token_type: z.string(),
});

let cachedToken:
  | {
      accessToken: string;
      expiresAt: number;
    }
  | null = null;

export class SpotifyTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpotifyTokenError";
  }
}

export async function getSpotifyClientCredentialsToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.accessToken;
  }

  const config = getSpotifyAuthConfig();

  if (!config) {
    return null;
  }

  const url = "https://accounts.spotify.com/api/token";
  const body = new URLSearchParams({ grant_type: "client_credentials" });
  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
  } catch (error) {
    apiDebug("Spotify client credentials network failure", {
      errorMessage: error instanceof Error ? error.message : "Unknown error",
      method: "POST",
      url,
    });
    throw new SpotifyTokenError("Unable to reach Spotify authorization.");
  }

  const responseBody: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    apiDebug("Spotify client credentials request failed", {
      method: "POST",
      responseBody: redactForLog(responseBody),
      status: response.status,
      statusText: response.statusText,
      url,
    });
    throw new SpotifyTokenError("Unable to configure Spotify catalog search.");
  }

  const parsed = clientCredentialsResponseSchema.safeParse(responseBody);

  if (!parsed.success) {
    apiDebug("Spotify client credentials response validation failed", {
      issues: redactForLog(parsed.error.issues),
      responseBody: redactForLog(responseBody),
      url,
    });
    throw new SpotifyTokenError("Spotify returned an invalid token response.");
  }

  cachedToken = {
    accessToken: parsed.data.access_token,
    expiresAt: Date.now() + parsed.data.expires_in * 1000,
  };

  return cachedToken.accessToken;
}

export function resetSpotifyClientCredentialsTokenCache() {
  cachedToken = null;
}
