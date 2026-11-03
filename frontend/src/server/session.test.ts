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
vi.mock("@/server/db/client", () => import("@/test/db"));

import { resetDb } from "@/test/db";
import { COOKIE_NAME, signToken } from "@/server/auth";
import { createUser, deleteUser, type Role, updateUser } from "@/server/store/users";
import { getSessionUser, requireAdmin } from "./session";

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

  it.each(["staff", "manager"] as const)("vai trò %s thì không qua", async (role) => {
    await loginAs(role);
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
