import { afterEach, describe, expect, it, vi } from "vitest";

import {
  computeUpstreamRetryDelayMs,
  fetchWithUpstreamRetry,
  resetUpstreamRetrySleepForTests,
  setUpstreamRetrySleepForTests,
} from "./upstreamRetry";

describe("upstreamRetry", () => {
  afterEach(() => {
    resetUpstreamRetrySleepForTests();
    vi.restoreAllMocks();
  });

  it("prefers Retry-After seconds over exponential backoff", () => {
    expect(
      computeUpstreamRetryDelayMs({
        attempt: 0,
        retryAfterHeader: "2",
        random: () => 0,
      }),
    ).toBe(2000);
  });

  it("parses Retry-After HTTP dates", () => {
    const now = Date.parse("Thu, 01 Jan 2026 00:00:00 GMT");
    expect(
      computeUpstreamRetryDelayMs({
        attempt: 0,
        now,
        retryAfterHeader: "Thu, 01 Jan 2026 00:00:03 GMT",
        random: () => 0,
      }),
    ).toBe(3000);
  });

  it("uses exponential backoff when Retry-After is missing", () => {
    expect(
      computeUpstreamRetryDelayMs({
        attempt: 0,
        baseDelayMs: 400,
        maxDelayMs: 8_000,
        retryAfterHeader: null,
        random: () => 0,
      }),
    ).toBe(400);

    expect(
      computeUpstreamRetryDelayMs({
        attempt: 2,
        baseDelayMs: 400,
        maxDelayMs: 8_000,
        retryAfterHeader: null,
        random: () => 0,
      }),
    ).toBe(1600);
  });

  it("retries 429 responses then returns success", async () => {
    const sleep = vi.fn(async () => undefined);
    setUpstreamRetrySleepForTests(sleep);

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("slow down", { status: 429, headers: { "Retry-After": "1" } }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const response = await fetchWithUpstreamRetry("https://example.test/search", undefined, {
      label: "test",
      maxRetries: 3,
      random: () => 0,
      sleep,
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1000);
  });

  it("returns the final 429 after retries are exhausted", async () => {
    const sleep = vi.fn(async () => undefined);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("API capacity exceeded", { status: 429 }),
    );

    const response = await fetchWithUpstreamRetry("https://example.test/search", undefined, {
      baseDelayMs: 10,
      maxRetries: 2,
      random: () => 0,
      sleep,
    });

    expect(response.status).toBe(429);
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-429 failures", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));

    const response = await fetchWithUpstreamRetry("https://example.test/search");

    expect(response.status).toBe(500);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
