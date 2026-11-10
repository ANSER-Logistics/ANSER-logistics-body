// Giới hạn trong bộ nhớ của 1 process Next.js — KHÔNG đồng bộ giữa nhiều instance. Nếu sau
// này scale ngang nhiều instance, mỗi instance có bộ đếm riêng nên giới hạn thật sẽ cao hơn
// MAX_ATTEMPTS nhân với số instance. Cần Redis (hoặc tương tự) nếu scale ngang.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

const attempts = new Map<string, { count: number; resetAt: number }>();

export function checkLoginRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_ATTEMPTS) return false;
  entry.count += 1;
  return true;
}
