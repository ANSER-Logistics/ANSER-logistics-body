import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Hũ cookie giả của request hiện tại; JWT_SECRET phải có trước khi auth.ts được nạp.
const jar = vi.hoisted(() => {
  vi.stubEnv("JWT_SECRET", "bi-mat-session-test");
  return new Map<string, string>();
});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
  }),
}));
vi.mock("@/server/db/client", () => import("@test/db"));

import { resetDb } from "@test/db";
import { COOKIE_NAME, signToken } from "@/server/auth";
import { createUser, deleteUser, type Role, updateUser } from "@/server/store/users";
import { getSessionUser, requireAdmin, requireAdminUser, requireSessionUser } from "@/server/session";

beforeEach(async () => {
  jar.clear();
  await resetDb();
});

afterAll(() => {
  vi.unstubAllEnvs();
});

async function loginAs(role: Role) {
  const user = await createUser({
    firstName: "Minh",
    lastName: "Trần",
    email: `${role}@anser.dev`,
    passwordHash: "$2a$10$hash",
    role,
  });
  jar.set(COOKIE_NAME, signToken(user.id));
  return user;
}

describe("getSessionUser", () => {
  it("không có cookie thì không có phiên", async () => {
    expect(await getSessionUser()).toBeUndefined();
  });

  it("cookie hợp lệ trả về đúng tài khoản trong database", async () => {
    const user = await loginAs("staff");
    expect(await getSessionUser()).toMatchObject({ id: user.id, email: "staff@anser.dev" });
  });

  it("cookie chứa rác thì không có phiên", async () => {
    jar.set(COOKIE_NAME, "khong-phai-jwt");
    expect(await getSessionUser()).toBeUndefined();
  });

  it("token hợp lệ nằm ở cookie khác tên thì không được tính", async () => {
    const user = await createUser({ firstName: "A", lastName: "B", email: "a@anser.dev", passwordHash: "x" });
    jar.set("token", signToken(user.id));
    expect(await getSessionUser()).toBeUndefined();
  });

  it("tài khoản đã bị xoá thì token cũ không còn phiên", async () => {
    const user = await loginAs("staff");
    await deleteUser(user.id);
    expect(await getSessionUser()).toBeUndefined();
  });
});

describe("requireAdmin", () => {
  it("chưa đăng nhập thì không qua", async () => {
    expect(await requireAdmin()).toBeUndefined();
  });

  it("vai trò staff thì không qua", async () => {
    await loginAs("staff");
    expect(await requireAdmin()).toBeUndefined();
  });

  it("admin thì qua và nhận lại chính tài khoản đó", async () => {
    const admin = await loginAs("admin");
    expect(await requireAdmin()).toMatchObject({ id: admin.id, role: "admin" });
  });

  it("admin bị hạ xuống staff thì token cũ mất quyền admin ngay", async () => {
    const admin = await loginAs("admin");
    expect(await requireAdmin()).toMatchObject({ id: admin.id });

    await updateUser(admin.id, { role: "staff" });

    expect(await requireAdmin()).toBeUndefined();
    expect(await getSessionUser()).toMatchObject({ id: admin.id, role: "staff" });
  });
});

describe("requireSessionUser", () => {
  it("chưa đăng nhập thì trả 401 kèm message tiếng Việt", async () => {
    const { user, response } = await requireSessionUser();
    expect(user).toBeUndefined();
    expect(response?.status).toBe(401);
    expect(await response?.json()).toEqual({ message: "Chưa đăng nhập." });
  });

  it("đã đăng nhập thì trả tài khoản, không có response", async () => {
    const staff = await loginAs("staff");
    const result = await requireSessionUser();
    expect(result.response).toBeUndefined();
    expect(result.user).toMatchObject({ id: staff.id });
  });
});

describe("requireAdminUser", () => {
  it("chưa đăng nhập thì trả 401, không phải 403", async () => {
    expect((await requireAdminUser()).response?.status).toBe(401);
  });

  it("staff thì trả 403 kèm message tiếng Việt", async () => {
    await loginAs("staff");
    const { user, response } = await requireAdminUser();
    expect(user).toBeUndefined();
    expect(response?.status).toBe(403);
    expect(await response?.json()).toEqual({ message: "Không có quyền truy cập." });
  });

  it("admin thì trả tài khoản", async () => {
    const admin = await loginAs("admin");
    const result = await requireAdminUser();
    expect(result.response).toBeUndefined();
    expect(result.user).toMatchObject({ id: admin.id, role: "admin" });
  });
});
