import { describe, expect, it, vi } from "vitest";

import { mapWithConcurrency } from "./mapWithConcurrency";

describe("mapWithConcurrency", () => {
  it("maps items in order with bounded concurrency", async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return value * 10;
    });

    expect(results).toEqual([10, 20, 30, 40, 50]);
    expect(maxInFlight).toBeLessThanOrEqual(2);
  });

  it("stops scheduling new work when shouldStop becomes true", async () => {
    let stop = false;
    const mapper = vi.fn(async (value: number) => {
      if (value === 2) {
        stop = true;
      }
      return value;
    });

    const results = await mapWithConcurrency([1, 2, 3, 4], 1, mapper, {
      shouldStop: () => stop,
      onStopped: (value) => value + 100,
    });

    expect(mapper).toHaveBeenCalledTimes(2);
    expect(results).toEqual([1, 2, 103, 104]);
  });
});
