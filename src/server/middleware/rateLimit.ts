import type { Request, Response, NextFunction } from "express";

interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
}

/**
 * Creates a rate limiter middleware.
 *
 * @param options Configuration options
 * @param options.windowMs Time window in milliseconds
 * @param options.max Max number of requests within the window
 * @param options.message Custom error message
 */
export function rateLimit(options: RateLimitOptions) {
  // Stores request timestamps for each IP, scoped to this middleware instance
  const hits = new Map<string, number[]>();

  // Cleanup interval (10 minutes)
  const interval = setInterval(() => {
    const now = Date.now();
    for (const [ip, times] of hits.entries()) {
      // Remove entries that haven't been active for an hour
      // Or simply filter based on windowMs to be more precise
      const validTimes = times.filter(t => now - t < options.windowMs);
      if (validTimes.length === 0) {
        hits.delete(ip);
      } else {
        hits.set(ip, validTimes);
      }
    }
  }, 600000);

  if (interval.unref) interval.unref(); // unref to allow process to exit

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || (req.socket ? req.socket.remoteAddress : "unknown") || "unknown";
    const now = Date.now();

    // Get existing timestamps for this IP
    let timestamps = hits.get(ip) || [];

    // Filter out timestamps older than the window
    timestamps = timestamps.filter(t => now - t < options.windowMs);

    // Check if limit exceeded
    if (timestamps.length >= options.max) {
      // Update with filtered timestamps to keep map clean
      hits.set(ip, timestamps);

      return res.status(429).json({
        error: options.message || "Too many requests, please try again later."
      });
    }

    // Record this request
    timestamps.push(now);
    hits.set(ip, timestamps);

    next();
  };
}
