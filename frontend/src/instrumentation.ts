// Opt-in only — deliberately not keyed on NODE_ENV, since some staging/preview environments
// also report "production". Seeding creates demo data and a demo admin login, so it must never
// run silently against a real client database; set this explicitly per environment.
const STARTUP_SEED_ENABLED = process.env.ENABLE_STARTUP_SEED === "true";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Chặn boot nếu production thiếu JWT_SECRET — "dev-secret-change-me" (fallback trong
  // src/server/auth.ts) ký được token hợp lệ cho BẤT KỲ ai biết chuỗi đó, tức là ai cũng
  // tự tạo được cookie đăng nhập giả nếu secret thật không được đặt.
  if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET chưa được đặt — bắt buộc trong production, không dùng secret mặc định.");
  }

  if (STARTUP_SEED_ENABLED) {
    const { runStartupSeed } = await import("@/server/store/seed");
    await runStartupSeed();
  }
}
