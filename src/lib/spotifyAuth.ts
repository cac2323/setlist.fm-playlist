import "server-only";

import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { apiDebug } from "./debug";
import { redactForLog } from "./redactForLog";

export const SPOTIFY_SCOPES = [
  "playlist-modify-private",
  "playlist-modify-public",
].join(" ");

export const SPOTIFY_COOKIE = {
  accessToken: "spotify_access_token",
  expiresAt: "spotify_token_expires_at",
  refreshToken: "spotify_refresh_token",
  oauthState: "spotify_oauth_state",
  oauthVerifier: "spotify_oauth_verifier",
} as const;

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().optional(),
  token_type: z.string(),
});

const profileResponseSchema = z.object({
  display_name: z.string().nullable().optional(),
  id: z.string().min(1),
});

export class SpotifyAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpotifyAuthError";
  }
}

export function getSpotifyAuthConfig() {
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim();
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI?.trim();

  if (!clientId || !clientSecret || !redirectUri) {
    return null;
  }

  if (process.env.NODE_ENV === "production") {
    try {
      const redirectUrl = new URL(redirectUri);
      const isLoopback =
        redirectUrl.hostname === "127.0.0.1" || redirectUrl.hostname === "localhost";

      if (redirectUrl.protocol !== "https:" && !isLoopback) {
        apiDebug("SPOTIFY_REDIRECT_URI should use HTTPS on a public production host", {
          hostname: redirectUrl.hostname,
          protocol: redirectUrl.protocol,
        });
      }
    } catch {
      apiDebug("SPOTIFY_REDIRECT_URI is not a valid URL", {
        redirectUriLength: redirectUri.length,
      });
    }
  }

  return { clientId, clientSecret, redirectUri };
}

export function createPkcePair() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createCodeChallenge(verifier);

  return { challenge, verifier };
}

export function createCodeChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

/** Short-lived cookies for the PKCE handshake (state + verifier). */
export function spotifyOAuthCookieOptions() {
  return {
    httpOnly: true,
    maxAge: 60 * 10,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

export function createOAuthState() {
  return randomBytes(16).toString("base64url");
}

export function buildSpotifyAuthorizeUrl(options: {
  challenge: string;
  clientId: string;
  redirectUri: string;
  state: string;
}) {
  const url = new URL("https://accounts.spotify.com/authorize");
  url.searchParams.set("client_id", options.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", options.redirectUri);
  url.searchParams.set("scope", SPOTIFY_SCOPES);
  url.searchParams.set("state", options.state);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("code_challenge", options.challenge);

  return url;
}

function getBasicAuthHeader(clientId: string, clientSecret: string) {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

async function requestSpotifyToken(body: URLSearchParams) {
  const config = getSpotifyAuthConfig();

  if (!config) {
    throw new SpotifyAuthError("Spotify credentials are not configured.");
  }

  const url = "https://accounts.spotify.com/api/token";
  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: getBasicAuthHeader(config.clientId, config.clientSecret),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
  } catch (error) {
    apiDebug("Spotify token request network failure", {
      errorMessage: error instanceof Error ? error.message : "Unknown error",
      method: "POST",
      url,
    });
    throw new SpotifyAuthError("Unable to reach Spotify authorization.");
  }

  const responseBody: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    apiDebug("Spotify token request failed", {
      method: "POST",
      responseBody: redactForLog(responseBody),
      status: response.status,
      statusText: response.statusText,
      url,
    });
    throw new SpotifyAuthError("Unable to complete Spotify authorization.");
  }

  const parsed = tokenResponseSchema.safeParse(responseBody);

  if (!parsed.success) {
    apiDebug("Spotify token response validation failed", {
      issues: redactForLog(parsed.error.issues),
      responseBody: redactForLog(responseBody),
      url,
    });
    throw new SpotifyAuthError("Spotify returned an invalid token response.");
  }

  return parsed.data;
}

export async function exchangeSpotifyAuthorizationCode(options: {
  code: string;
  verifier: string;
}) {
  const config = getSpotifyAuthConfig();

  if (!config) {
    throw new SpotifyAuthError("Spotify credentials are not configured.");
  }

  return requestSpotifyToken(
    new URLSearchParams({
      client_id: config.clientId,
      code: options.code,
      code_verifier: options.verifier,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri,
    }),
  );
}

export async function refreshSpotifyAccessToken(refreshToken: string) {
  return requestSpotifyToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  );
}

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    maxAge: maxAgeSeconds,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

export function applySpotifyTokenCookies(
  response: NextResponse,
  tokens: {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  },
) {
  const expiresAt = String(Date.now() + tokens.expires_in * 1000);

  response.cookies.set(
    SPOTIFY_COOKIE.accessToken,
    tokens.access_token,
    cookieOptions(tokens.expires_in),
  );
  response.cookies.set(SPOTIFY_COOKIE.expiresAt, expiresAt, cookieOptions(60 * 60 * 24 * 30));

  if (tokens.refresh_token) {
    response.cookies.set(
      SPOTIFY_COOKIE.refreshToken,
      tokens.refresh_token,
      cookieOptions(60 * 60 * 24 * 30),
    );
  }

  return response;
}

export function clearSpotifyAuthCookies(response: NextResponse) {
  for (const name of Object.values(SPOTIFY_COOKIE)) {
    response.cookies.set(name, "", { ...cookieOptions(0), maxAge: 0 });
  }

  return response;
}

export function clearSpotifyOAuthCookies(response: NextResponse) {
  response.cookies.set(SPOTIFY_COOKIE.oauthState, "", { ...cookieOptions(0), maxAge: 0 });
  response.cookies.set(SPOTIFY_COOKIE.oauthVerifier, "", { ...cookieOptions(0), maxAge: 0 });
  return response;
}

export async function getSpotifyAccessTokenFromCookies() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(SPOTIFY_COOKIE.accessToken)?.value;
  const refreshToken = cookieStore.get(SPOTIFY_COOKIE.refreshToken)?.value;
  const expiresAtRaw = cookieStore.get(SPOTIFY_COOKIE.expiresAt)?.value;
  const expiresAt = expiresAtRaw ? Number(expiresAtRaw) : 0;

  if (accessToken && expiresAt > Date.now() + 30_000) {
    return { accessToken, refreshed: false as const };
  }

  if (!refreshToken) {
    return null;
  }

  const tokens = await refreshSpotifyAccessToken(refreshToken);
  return {
    accessToken: tokens.access_token,
    refreshed: true as const,
    tokens: {
      access_token: tokens.access_token,
      expires_in: tokens.expires_in,
      refresh_token: tokens.refresh_token ?? refreshToken,
    },
  };
}

export async function fetchSpotifyProfile(accessToken: string) {
  const url = "https://api.spotify.com/v1/me";
  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
  } catch (error) {
    apiDebug("Spotify profile request network failure", {
      errorMessage: error instanceof Error ? error.message : "Unknown error",
      method: "GET",
      url,
    });
    throw new SpotifyAuthError("Unable to reach Spotify profile API.");
  }

  const responseBody: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    apiDebug("Spotify profile request failed", {
      method: "GET",
      responseBody,
      status: response.status,
      statusText: response.statusText,
      url,
    });
    throw new SpotifyAuthError("Unable to load Spotify profile.");
  }

  const parsed = profileResponseSchema.safeParse(responseBody);

  if (!parsed.success) {
    throw new SpotifyAuthError("Spotify returned an invalid profile response.");
  }

  return {
    displayName: parsed.data.display_name ?? parsed.data.id,
    id: parsed.data.id,
  };
}
