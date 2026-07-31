import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach } from "vitest";

import {
  clearRateLimitPolicyOverridesForTests,
  resetRateLimitStoreForTests,
} from "@/lib/rateLimit";
import {
  resetUpstreamRetrySleepForTests,
  setUpstreamRetrySleepForTests,
} from "@/lib/upstreamRetry";

beforeEach(() => {
  // Catalog searches retry 429s with backoff; skip wall-clock waits in tests.
  setUpstreamRetrySleepForTests(async () => undefined);
});

afterEach(() => {
  resetRateLimitStoreForTests();
  clearRateLimitPolicyOverridesForTests();
  resetUpstreamRetrySleepForTests();
});
