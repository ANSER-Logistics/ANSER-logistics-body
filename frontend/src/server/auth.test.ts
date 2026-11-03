import jwt from "jsonwebtoken";
import { afterEach, describe, expect, it, vi } from "vitest";

const SECRET = "bi-mat-chi-dung-trong-test";
const SEVEN_DAYS = 7 * 24 * 60 * 60;

// JWT_SECRET và NODE_ENV được đọc lúc nạp module — đặt env rồi mới import lại.
async function loadAuth(env: Record<string, string> = {}) {
  vi.stubEnv("JWT_SECRET", SECRET);
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  vi.resetModules();
  return import("./auth");
}

function base64url(value: object) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("signToken / verifyToken", () => {
  it("token ký ra xác minh lại được và mang đúng userId", async () => {
    const { signToken, verifyToken } = await loadAuth();
    expect(verifyToken(signToken("user-123"))?.sub).toBe("user-123");
  });

  it("ký bằng JWT_SECRET lấy từ môi trường", async () => {
    const { JWT_SECRET, signToken } = await loadAuth();
    expect(JWT_SECRET).toBe(SECRET);
    expect(jwt.verify(signToken("user-123"), SECRET)).toMatchObject({ sub: "user-123" });
  });

  it("token sống đúng 7 ngày, khớp với maxAge của cookie", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = new Date("2026-01-01T00:00:00Z").getTime();
    vi.setSystemTime(start);
    const { authCookieOptions, signToken, verifyToken } = await loadAuth();
    const token = signToken("user-123");

    const { iat, exp } = jwt.decode(token) as { iat: number; exp: number };
    expect(exp - iat).toBe(SEVEN_DAYS);
    expect(authCookieOptions.maxAge).toBe(SEVEN_DAYS);

    vi.setSystemTime(start + (SEVEN_DAYS - 1) * 1000);
    expect(verifyToken(token)?.sub).toBe("user-123");

    vi.setSystemTime(start + (SEVEN_DAYS + 1) * 1000);
    expect(verifyToken(token)).toBeNull();
  });

  it("sửa payload (đổi sub) mà giữ chữ ký cũ thì bị từ chối", async () => {
    const { signToken, verifyToken } = await loadAuth();
    const [header, payload, signature] = signToken("user-123").split(".");
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    const forged = [header, base64url({ ...claims, sub: "admin-khac" }), signature].join(".");

    expect(verifyToken(forged)).toBeNull();
  });

  it("token ký bằng secret khác thì bị từ chối", async () => {
    const { verifyToken } = await loadAuth();
    expect(verifyToken(jwt.sign({ sub: "user-123" }, "secret-cua-ke-khac"))).toBeNull();
  });

  it('token alg "none" không chữ ký thì bị từ chối', async () => {
    const { verifyToken } = await loadAuth();
    const unsigned = `${base64url({ alg: "none", typ: "JWT" })}.${base64url({ sub: "user-123" })}.`;
    expect(verifyToken(unsigned)).toBeNull();
  });

  it("chuỗi rác trả null chứ không ném lỗi", async () => {
    const { verifyToken } = await loadAuth();
    for (const garbage of ["", "abc", "a.b.c", "undefined"]) {
      expect(verifyToken(garbage)).toBeNull();
    }
  });
});

describe("authCookieOptions", () => {
  it("cookie httpOnly, sameSite lax, toàn site, sống 7 ngày; không bắt https ngoài production", async () => {
    const { authCookieOptions } = await loadAuth({ NODE_ENV: "development" });
    expect(authCookieOptions).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: SEVEN_DAYS,
    });
  });

  it("production thì cookie chỉ gửi qua https", async () => {
    const { authCookieOptions } = await loadAuth({ NODE_ENV: "production" });
    expect(authCookieOptions.secure).toBe(true);
    expect(authCookieOptions.httpOnly).toBe(true);
  });
});
