/**
 * In-memory token bucket per wallet. Each request costs one token; a bucket
 * holds `capacity` tokens and refills at `refillPerMinute`. Single-process
 * only: behind several replicas this needs a shared store (e.g. Redis).
 */
export class RateLimiter {
  private readonly buckets = new Map<string, { tokens: number; at: number }>();

  constructor(
    private readonly capacity: number,
    private readonly refillPerMinute: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Returns 0 if allowed, else the seconds to wait before retrying. */
  take(key: string): number {
    const t = this.now();
    const b = this.buckets.get(key) ?? { tokens: this.capacity, at: t };
    const refilled = Math.min(this.capacity, b.tokens + ((t - b.at) / 60_000) * this.refillPerMinute);
    if (refilled >= 1) {
      this.buckets.set(key, { tokens: refilled - 1, at: t });
      this.sweep(t);
      return 0;
    }
    this.buckets.set(key, { tokens: refilled, at: t });
    if (this.refillPerMinute <= 0) return 60;
    return Math.max(1, Math.ceil(((1 - refilled) / this.refillPerMinute) * 60));
  }

  /** Drops full buckets now and then so the map does not grow unbounded. */
  private sweep(t: number) {
    if (this.buckets.size < 10_000) return;
    for (const [k, b] of this.buckets) {
      if (b.tokens + ((t - b.at) / 60_000) * this.refillPerMinute >= this.capacity) this.buckets.delete(k);
    }
  }
}
