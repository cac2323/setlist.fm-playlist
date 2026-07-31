/**
 * Run async work over items with a fixed worker pool.
 * Preserves result order. Stops scheduling new work after `shouldStop` returns true
 * (in-flight tasks still finish).
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
  options?: {
    shouldStop?: () => boolean;
    onStopped?: (item: T, index: number) => R;
  },
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(concurrency, 1), items.length);

  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;

      if (index >= items.length) {
        return;
      }

      if (options?.shouldStop?.()) {
        if (options.onStopped) {
          results[index] = options.onStopped(items[index]!, index);
          continue;
        }
        return;
      }

      results[index] = await mapper(items[index]!, index);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
