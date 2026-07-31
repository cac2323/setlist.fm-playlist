import { apiDebug } from "./debug";

export type UpstreamRetryOptions = {
  /** Extra context for debug logs (e.g. service name). */
  label?: string;
  /** Attempts after the first request (default 3 → 4 total tries). */
  maxRetries?: number;
  /** Exponential base when Retry-After is absent (default 400ms). */
  baseDelayMs?: number;
  /** Cap on wait between attempts (default 8s). */
  maxDelayMs?: number;
  /** Override sleep (tests). */
  sleep?: (ms: number) => Promise<void>;
  /** Override RNG for jitter (tests). */
  random?: () => number;
};

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 400;
const DEFAULT_MAX_DELAY_MS = 8_000;

let defaultSleep: (ms: number) => Promise<void> = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** Test helper: skip real waits so catalog suites stay fast. */
export function setUpstreamRetrySleepForTests(sleep: (ms: number) => Promise<void>) {
  defaultSleep = sleep;
}

export function resetUpstreamRetrySleepForTests() {
  defaultSleep = (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
}

/**
 * Prefer Retry-After (seconds or HTTP-date); otherwise exponential backoff + jitter.
 */
export function computeUpstreamRetryDelayMs(options: {
  attempt: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  now?: number;
  random?: () => number;
  retryAfterHeader: string | null;
}): number {
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const random = options.random ?? Math.random;
  const header = options.retryAfterHeader?.trim();

  if (header) {
    const asSeconds = Number(header);
    if (Number.isFinite(asSeconds) && asSeconds >= 0) {
      return Math.min(maxDelayMs, Math.ceil(asSeconds * 1000));
    }

    const asDate = Date.parse(header);
    if (!Number.isNaN(asDate)) {
      const now = options.now ?? Date.now();
      return Math.min(maxDelayMs, Math.max(0, asDate - now));
    }
  }

  const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** options.attempt);
  const jitter = Math.floor(random() * Math.min(250, Math.max(1, exponential * 0.25)));
  return exponential + jitter;
}

/**
 * Fetch wrapper for upstream catalog APIs: retries 429s with Retry-After / backoff.
 * Returns the final Response (including a terminal 429) for the caller to handle.
 */
export async function fetchWithUpstreamRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  options: UpstreamRetryOptions = {},
): Promise<Response> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;
  const label = options.label ?? "upstream";

  let attempt = 0;

  while (true) {
    const response = await fetch(input, init);

    if (response.status !== 429 || attempt >= maxRetries) {
      return response;
    }

    const retryAfterHeader = response.headers.get("Retry-After");
    const delayMs = computeUpstreamRetryDelayMs({
      attempt,
      baseDelayMs,
      maxDelayMs,
      random,
      retryAfterHeader,
    });

    apiDebug("Upstream catalog search rate limited; retrying", {
      attempt: attempt + 1,
      delayMs,
      label,
      maxRetries,
      retryAfterHeader,
      status: response.status,
      url: String(input),
    });

    // Drain the body so the connection can be reused.
    await response.text().catch(() => undefined);
    await sleep(delayMs);
    attempt += 1;
  }
}
