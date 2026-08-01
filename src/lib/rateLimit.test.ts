import { afterEach, describe, expect, it, vi } from "vitest";

import {
  checkRateLimit,
  clearRateLimitPolicyOverridesForTests,
  enforceApiRateLimit,
  getClientIp,
  getRateLimitPolicy,
  resetRateLimitStoreForTests,
  setRateLimitPolicyForTests,
} from "./rateLimit";

describe("rateLimit", () => {
  afterEach(() => {
    resetRateLimitStoreForTests();
    clearRateLimitPolicyOverridesForTests();
    vi.unstubAllEnvs();
  });

  it("allows requests under the limit and tracks remaining", () => {
    const first = checkRateLimit("setlist:1.1.1.1", { limit: 2, windowMs: 60_000 }, 1_000);
    const second = checkRateLimit("setlist:1.1.1.1", { limit: 2, windowMs: 60_000 }, 1_100);

    expect(first).toEqual({
      allowed: true,
      limit: 2,
      remaining: 1,
      retryAfterSeconds: 0,
    });
    expect(second).toEqual({
      allowed: true,
      limit: 2,
      remaining: 0,
      retryAfterSeconds: 0,
    });
  });

  it("blocks once the sliding window is full", () => {
    checkRateLimit("setlist:2.2.2.2", { limit: 1, windowMs: 60_000 }, 5_000);
    const blocked = checkRateLimit("setlist:2.2.2.2", { limit: 1, windowMs: 60_000 }, 5_500);

    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBe(60);
  });

  it("allows traffic again after timestamps leave the window", () => {
    checkRateLimit("setlist:3.3.3.3", { limit: 1, windowMs: 1_000 }, 10_000);
    const blocked = checkRateLimit("setlist:3.3.3.3", { limit: 1, windowMs: 1_000 }, 10_500);
    const allowed = checkRateLimit("setlist:3.3.3.3", { limit: 1, windowMs: 1_000 }, 11_001);

    expect(blocked.allowed).toBe(false);
    expect(allowed.allowed).toBe(true);
  });

  it("isolates buckets by key", () => {
    checkRateLimit("setlist:a", { limit: 1, windowMs: 60_000 }, 1);
    const other = checkRateLimit("setlist:b", { limit: 1, windowMs: 60_000 }, 1);

    expect(other.allowed).toBe(true);
  });

  it("reads client IP from forwarded headers", () => {
    expect(
      getClientIp(
        new Request("http://localhost/api/setlist", {
          headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.1" },
        }),
      ),
    ).toBe("203.0.113.10");

    expect(
      getClientIp(
        new Request("http://localhost/api/setlist", {
          headers: { "x-real-ip": "198.51.100.7" },
        }),
      ),
    ).toBe("198.51.100.7");
  });

  it("returns a 429 response from enforceApiRateLimit when exceeded", async () => {
    setRateLimitPolicyForTests("setlist", { limit: 1, windowMs: 60_000 });

    const request = new Request("http://localhost/api/setlist", {
      headers: { "x-forwarded-for": "203.0.113.50" },
    });

    expect(enforceApiRateLimit(request, "setlist")).toBeNull();

    const limited = enforceApiRateLimit(request, "setlist");
    expect(limited?.status).toBe(429);
    await expect(limited?.json()).resolves.toEqual({
      error: "Too many requests. Please try again shortly.",
    });
    expect(limited?.headers.get("Retry-After")).toBeTruthy();
    expect(limited?.headers.get("X-RateLimit-Limit")).toBe("1");
  });

  it("skips enforcement when DISABLE_API_RATE_LIMIT is true", () => {
    vi.stubEnv("DISABLE_API_RATE_LIMIT", "true");
    setRateLimitPolicyForTests("setlist", { limit: 1, windowMs: 60_000 });

    const request = new Request("http://localhost/api/setlist", {
      headers: { "x-forwarded-for": "203.0.113.51" },
    });

    expect(enforceApiRateLimit(request, "setlist")).toBeNull();
    expect(enforceApiRateLimit(request, "setlist")).toBeNull();
  });

  it("exposes default policies for public routes", () => {
    expect(getRateLimitPolicy("catalogMatch").limit).toBeGreaterThan(0);
    expect(getRateLimitPolicy("catalogSearch").limit).toBeGreaterThan(0);
    expect(getRateLimitPolicy("appleToken").limit).toBeGreaterThan(0);
    expect(getRateLimitPolicy("playlistCreate").limit).toBeGreaterThan(0);
  });
});
