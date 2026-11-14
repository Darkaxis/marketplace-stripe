import type { NextRequest } from "next/server";

interface RateLimitBucket {
  timestamps: number[];
}

const globalForRateLimit = globalThis as unknown as {
  rateLimitStore?: Map<string, RateLimitBucket>;
};

const store =
  globalForRateLimit.rateLimitStore ?? new Map<string, RateLimitBucket>();

if (!globalForRateLimit.rateLimitStore) {
  globalForRateLimit.rateLimitStore = store;
}

export function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  return "local";
}

/**
 * Best-effort sliding-window rate limiter per client IP.
 * Note: In multi-instance serverless deployments, use distributed storage (e.g., Redis/Upstash) for global enforcement.
 */
export function checkRateLimit(
  request: NextRequest,
  keyPrefix: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const windowStart = now - windowMs;
  const ip = getClientIp(request);
  const key = `${keyPrefix}:${ip}`;

  // Periodic cleanup if map grows
  if (store.size > 5000) {
    for (const [entryKey, bucket] of store.entries()) {
      const fresh = bucket.timestamps.filter((ts) => ts > windowStart);
      if (fresh.length === 0) {
        store.delete(entryKey);
      } else {
        bucket.timestamps = fresh;
      }
    }
  }

  const bucket = store.get(key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((ts) => ts > windowStart);

  if (bucket.timestamps.length >= maxRequests) {
    const oldestInWindow = bucket.timestamps[0] ?? now;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((oldestInWindow + windowMs - now) / 1000)
    );
    store.set(key, bucket);
    return { allowed: false, retryAfterSeconds };
  }

  bucket.timestamps.push(now);
  store.set(key, bucket);
  return { allowed: true, retryAfterSeconds: 0 };
}
