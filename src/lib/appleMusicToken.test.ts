import { readFile } from "node:fs/promises";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearAppleMusicDeveloperTokenCache, getAppleMusicDeveloperToken } from "./appleMusicToken";

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  default: {
    readFile: mocks.readFile,
  },
  readFile: mocks.readFile,
}));

vi.mock("jose", () => ({
  importPKCS8: vi.fn(async () => "signing-key"),
  SignJWT: class SignJWT {
    setProtectedHeader = vi.fn(() => this);
    setIssuer = vi.fn(() => this);
    setIssuedAt = vi.fn(() => this);
    setExpirationTime = vi.fn(() => this);
    sign = vi.fn(async () => "generated-token");
  },
}));

describe("getAppleMusicDeveloperToken", () => {
  beforeEach(() => {
    clearAppleMusicDeveloperTokenCache();
    vi.resetModules();
    vi.mocked(readFile).mockResolvedValue("-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----");
    mocks.readFile.mockClear();
    delete process.env.APPLE_MUSIC_DEVELOPER_TOKEN;
    delete process.env.APPLE_MUSIC_TEAM_ID;
    delete process.env.APPLE_MUSIC_KEY_ID;
    delete process.env.APPLE_MUSIC_PRIVATE_KEY;
    delete process.env.APPLE_MUSIC_PRIVATE_KEY_PATH;
  });

  it("uses an explicit developer token when present", async () => {
    process.env.APPLE_MUSIC_DEVELOPER_TOKEN = "explicit-token";

    await expect(getAppleMusicDeveloperToken()).resolves.toBe("explicit-token");
    expect(readFile).not.toHaveBeenCalled();
  });

  it("returns null when signing config is incomplete", async () => {
    process.env.APPLE_MUSIC_TEAM_ID = "TEAMID";

    await expect(getAppleMusicDeveloperToken()).resolves.toBeNull();
    expect(readFile).not.toHaveBeenCalled();
  });

  it("generates a token from private key path config", async () => {
    process.env.APPLE_MUSIC_TEAM_ID = "TEAMID";
    process.env.APPLE_MUSIC_KEY_ID = "KEYID";
    process.env.APPLE_MUSIC_PRIVATE_KEY_PATH = "./AuthKey_KEYID.p8";

    await expect(getAppleMusicDeveloperToken()).resolves.toBe("generated-token");
    expect(readFile).toHaveBeenCalledWith(
      expect.stringContaining("AuthKey_KEYID.p8"),
      "utf8",
    );
  });

  it("generates a token from APPLE_MUSIC_PRIVATE_KEY when it contains a path", async () => {
    process.env.APPLE_MUSIC_TEAM_ID = "TEAMID";
    process.env.APPLE_MUSIC_KEY_ID = "KEYID";
    process.env.APPLE_MUSIC_PRIVATE_KEY = "./AuthKey_KEYID.p8";

    await expect(getAppleMusicDeveloperToken()).resolves.toBe("generated-token");
    expect(readFile).toHaveBeenCalledWith(
      expect.stringContaining("AuthKey_KEYID.p8"),
      "utf8",
    );
  });

  it("generates a token from APPLE_MUSIC_PRIVATE_KEY when it contains inline PEM contents", async () => {
    process.env.APPLE_MUSIC_TEAM_ID = "TEAMID";
    process.env.APPLE_MUSIC_KEY_ID = "KEYID";
    process.env.APPLE_MUSIC_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\\ntest\\n-----END PRIVATE KEY-----";

    await expect(getAppleMusicDeveloperToken()).resolves.toBe("generated-token");
    expect(readFile).not.toHaveBeenCalled();
  });
});
