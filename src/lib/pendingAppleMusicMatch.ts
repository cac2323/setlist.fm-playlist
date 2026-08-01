import { z } from "zod";

const PENDING_APPLE_MUSIC_MATCH_KEY = "setlist-playlist:pending-apple-music-match";
/** Mobile MusicKit auth often full-page redirects; localStorage survives better than sessionStorage. */
const PENDING_MAX_AGE_MS = 60 * 60 * 1000;

const pendingAppleMusicMatchSchema = z.object({
  savedAt: z.number().int().positive(),
  setlistId: z.string().min(1),
  setlistUrl: z.string().min(1),
});

export type PendingAppleMusicMatch = z.infer<typeof pendingAppleMusicMatchSchema>;

function writeStore(raw: string) {
  window.localStorage.setItem(PENDING_APPLE_MUSIC_MATCH_KEY, raw);
  try {
    window.sessionStorage.setItem(PENDING_APPLE_MUSIC_MATCH_KEY, raw);
  } catch {
    // sessionStorage can throw in private mode; localStorage is enough.
  }
}

function readStore(): string | null {
  try {
    const fromSession = window.sessionStorage.getItem(PENDING_APPLE_MUSIC_MATCH_KEY);
    if (fromSession) {
      return fromSession;
    }
  } catch {
    // ignore
  }

  return window.localStorage.getItem(PENDING_APPLE_MUSIC_MATCH_KEY);
}

function removeStore() {
  window.localStorage.removeItem(PENDING_APPLE_MUSIC_MATCH_KEY);
  try {
    window.sessionStorage.removeItem(PENDING_APPLE_MUSIC_MATCH_KEY);
  } catch {
    // ignore
  }
}

export function savePendingAppleMusicMatch(intent: {
  setlistId: string;
  setlistUrl: string;
}) {
  if (typeof window === "undefined") {
    return;
  }

  writeStore(
    JSON.stringify({
      savedAt: Date.now(),
      setlistId: intent.setlistId,
      setlistUrl: intent.setlistUrl,
    } satisfies PendingAppleMusicMatch),
  );
}

export function readPendingAppleMusicMatch(): PendingAppleMusicMatch | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = readStore();
  if (!raw) {
    return null;
  }

  try {
    const parsed = pendingAppleMusicMatchSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      removeStore();
      return null;
    }

    if (Date.now() - parsed.data.savedAt > PENDING_MAX_AGE_MS) {
      removeStore();
      return null;
    }

    return parsed.data;
  } catch {
    removeStore();
    return null;
  }
}

export function clearPendingAppleMusicMatch() {
  if (typeof window === "undefined") {
    return;
  }

  removeStore();
}
