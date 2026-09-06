import { NextRequest } from "next/server";

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

// In-memory sliding window cache for Edge Worker invocations
const memoryCache = new Map<string, RateLimitRecord>();

export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; resetInSeconds: number }> {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  // Try using Cloudflare KV if bound
  const kv = (process.env as any).CACHE as KVNamespace | undefined;
  if (kv) {
    try {
      const kvKey = `ratelimit:${key}`;
      const data = await kv.get<RateLimitRecord>(kvKey, "json");

      if (!data || data.resetAt < now) {
        const record: RateLimitRecord = { count: 1, resetAt: now + windowMs };
        await kv.put(kvKey, JSON.stringify(record), { expirationTtl: windowSeconds + 10 });
        return { allowed: true, remaining: maxRequests - 1, resetInSeconds: windowSeconds };
      }

      if (data.count >= maxRequests) {
        const resetInSeconds = Math.max(1, Math.ceil((data.resetAt - now) / 1000));
        return { allowed: false, remaining: 0, resetInSeconds };
      }

      data.count += 1;
      const resetInSeconds = Math.max(1, Math.ceil((data.resetAt - now) / 1000));
      await kv.put(kvKey, JSON.stringify(data), { expirationTtl: resetInSeconds + 10 });
      return { allowed: true, remaining: maxRequests - data.count, resetInSeconds };
    } catch {
      // Fallback to in-memory on KV error
    }
  }

  // In-memory fallback
  const record = memoryCache.get(key);
  if (!record || record.resetAt < now) {
    memoryCache.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetInSeconds: windowSeconds };
  }

  if (record.count >= maxRequests) {
    const resetInSeconds = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
    return { allowed: false, remaining: 0, resetInSeconds };
  }

  record.count += 1;
  const resetInSeconds = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
  return { allowed: true, remaining: maxRequests - record.count, resetInSeconds };
}

export function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "127.0.0.1"
  );
}
