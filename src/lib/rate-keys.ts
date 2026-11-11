/**
 * Rate-limit key and window format. No imports, so the limiter, the security test script and the cleanup
 * code all agree on it.
 */
export const windowStartMs = (windowSec: number, now = Date.now()) => Math.floor(now / (windowSec * 1000)) * windowSec * 1000;

export const HOUR = 3600;
export const DAY = 86400;

export const aiKeys = {
  ipHour: (ip: string) => `ai:hour:${ip}`,
  ipDay: (ip: string) => `ai:day:${ip}`,
  globalDay: () => "ai:global:day",
};
export const AI_PER_IP_PER_HOUR = 30;
export const AI_PER_IP_PER_DAY = 100;
export const PAYPAL_WRITE_PER_HOUR = 30;
export const paypalWriteKey = (ip: string) => `paypal-write:hour:${ip}`;
