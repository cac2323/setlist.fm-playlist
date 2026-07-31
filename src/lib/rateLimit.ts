import "server-only";

import { NextResponse } from "next/server";

import { apiDebug } from "@/lib/debug";

export type RateLimitConfig = {
  /** Max requests allowed inside the sliding window. */
  limit: number;
  /** Sliding window length in milliseconds. */
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

type BucketEntry = {
  timestamps: number[];
};

const store = new Map<string, BucketEntry>();

const DEFAULT_POLICIES = {
  /** setlist.fm proxy — one upstream call per request. */
  setlist: { limit: 30, windowMs: 60_000 },
  /** Match fans out into many catalog searches. */
  catalogMatch: { limit: 10, windowMs: 60_000 },
  /** Manual track repair searches. */
  catalogSearch: { limit: 60, windowMs: 60_000 },
  /** Apple Music developer token for MusicKit. */
  appleToken: { limit: 40, windowMs: 60_000 },
  /** Spotify playlist create + track adds. */
  playlistCreate: { limit: 15, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitConfig>;

export type RateLimitPolicyName = keyof typeof DEFAULT_POLICIES;

const policyOverrides = new Map<RateLimitPolicyName, RateLimitConfig>();

export function getRateLimitPolicy(name: RateLimitPolicyName): RateLimitConfig {
  return policyOverrides.get(name) ?? DEFAULT_POLICIES[name];
}

/** Test helper: override a named policy (cleared between tests). */
export function setRateLimitPolicyForTests(
  name: RateLimitPolicyName,
  config: RateLimitConfig,
) {
  policyOverrides.set(name, config);
}

export function clearRateLimitPolicyOverridesForTests() {
  policyOverrides.clear();
}

export function resetRateLimitStoreForTests() {
  store.clear();
}

/**
 * Best-effort client IP for edge/proxy deployments.
 * Falls back to "unknown" (shared bucket) when headers are absent.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  const vercelIp = request.headers.get("x-vercel-forwarded-for")?.trim();
  if (vercelIp) {
    return vercelIp.split(",")[0]?.trim() || "unknown";
  }

  return "unknown";
}

export function checkRateLimit(
  key: string,
  config: RateLimitConfig,
  now = Date.now(),
): RateLimitResult {
  const cutoff = now - config.windowMs;
  let entry = store.get(key);

  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  } else {
    entry.timestamps = entry.timestamps.filter((timestamp) => timestamp > cutoff);
  }

  if (entry.timestamps.length >= config.limit) {
    const oldest = entry.timestamps[0] ?? now;
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + config.windowMs - now) / 1000));

    return {
      allowed: false,
      limit: config.limit,
      remaining: 0,
      retryAfterSeconds,
    };
  }

  entry.timestamps.push(now);

  // Bound memory if many unique keys accumulate.
  if (store.size > 10_000) {
    pruneRateLimitStore(now);
  }

  return {
    allowed: true,
    limit: config.limit,
    remaining: config.limit - entry.timestamps.length,
    retryAfterSeconds: 0,
  };
}

function pruneRateLimitStore(now: number) {
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((timestamp) => timestamp > now - 60 * 60 * 1000);
    if (entry.timestamps.length === 0) {
      store.delete(key);
    }
  }
}

export function rateLimitedJsonResponse(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    { error: "Too many requests. Please try again shortly." },
    {
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(result.retryAfterSeconds),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": "0",
      },
      status: 429,
    },
  );
}

/**
 * Returns a 429 response when the client exceeds the named policy, otherwise null.
 * In-memory / per-instance — soft protection suitable for a single deploy without Redis.
 */
export function enforceApiRateLimit(
  request: Request,
  policyName: RateLimitPolicyName,
): NextResponse | null {
  const policy = getRateLimitPolicy(policyName);
  const ip = getClientIp(request);
  const result = checkRateLimit(`${policyName}:${ip}`, policy);

  if (result.allowed) {
    return null;
  }

  apiDebug("API rate limit exceeded", {
    ip,
    limit: result.limit,
    policy: policyName,
    retryAfterSeconds: result.retryAfterSeconds,
  });

  return rateLimitedJsonResponse(result);
}
