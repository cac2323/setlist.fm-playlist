import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { importPKCS8, SignJWT } from "jose";

const APPLE_MUSIC_TOKEN_TTL_SECONDS = 60 * 60;

let cachedToken: {
  expiresAt: number;
  token: string;
} | null = null;

export function clearAppleMusicDeveloperTokenCache() {
  cachedToken = null;
}

export class AppleMusicTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppleMusicTokenError";
  }
}

export async function getAppleMusicDeveloperToken() {
  if (process.env.APPLE_MUSIC_DEVELOPER_TOKEN) {
    return process.env.APPLE_MUSIC_DEVELOPER_TOKEN;
  }

  const teamId = process.env.APPLE_MUSIC_TEAM_ID;
  const keyId = process.env.APPLE_MUSIC_KEY_ID;
  const privateKeyPath = process.env.APPLE_MUSIC_PRIVATE_KEY_PATH;
  const privateKeyValue = process.env.APPLE_MUSIC_PRIVATE_KEY;
  const privateKeySource = privateKeyPath ?? privateKeyValue;

  if (!teamId || !keyId || !privateKeySource) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);

  if (cachedToken && cachedToken.expiresAt - 60 > now) {
    return cachedToken.token;
  }

  let privateKey: string;

  if (privateKeyValue?.includes("-----BEGIN PRIVATE KEY-----")) {
    privateKey = privateKeyValue.replace(/\\n/g, "\n");
  } else {
    const resolvedPrivateKeyPath = path.isAbsolute(privateKeySource)
      ? privateKeySource
      : path.resolve(/* turbopackIgnore: true */ process.cwd(), privateKeySource);

    try {
      privateKey = await readFile(resolvedPrivateKeyPath, "utf8");
    } catch (error) {
      throw error;
    }
  }

  const signingKey = await importPKCS8(privateKey, "ES256");
  const expiresAt = now + APPLE_MUSIC_TOKEN_TTL_SECONDS;
  const token = await new SignJWT({})
    .setProtectedHeader({
      alg: "ES256",
      kid: keyId,
    })
    .setIssuer(teamId)
    .setIssuedAt(now)
    .setExpirationTime(expiresAt)
    .sign(signingKey);

  cachedToken = {
    expiresAt,
    token,
  };

  return token;
}
