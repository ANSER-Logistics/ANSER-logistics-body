import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/client", () => import("@/test/db"));

import { db, resetDb } from "@/test/db";
import { users } from "@/server/db/schema";
import {
  countAdmins,
  createUser,
  deleteUser,
  DEMO_ACCOUNT,
  findUserByEmail,
  findUserById,
  listUsers,
  type Role,
  seedDemoUser,
  toPublicUser,
  updateUser,
} from "./users";

beforeEach(resetDb);

const MISSING_ID = "00000000-0000-4000-8000-000000000000";

function makeUser(email: string, extra: { firstName?: string; role?: Role } = {}) {
  return createUser({
    firstName: extra.firstName ?? "Lan",
    lastName: "Nguyễn",
    email,
    passwordHash: "$2a$10$hash",
    role: extra.role,
  });
}

describe("toPublicUser", () => {
  it("không bao giờ trả passwordHash ra ngoài", async () => {
    const user = await createUser({
      firstName: "Lan",
      lastName: "Nguyễn",
      email: "ketoan@anser.dev",
      passwordHash: "$2a$10$hash",
    });

    const publicUser = toPublicUser(user);

    expect(publicUser).not.toHaveProperty("passwordHash");
    expect(JSON.stringify(publicUser)).not.toContain("$2a$10$hash");
    expect(publicUser).toMatchObject({ id: user.id, email: "ketoan@anser.dev" });
  });
});

describe("users store", () => {
  it("email lưu chữ thường và tìm được dù gõ hoa thường thế nào", async () => {
    const user = await makeUser("KeToan@ANSER.dev");
    expect(user.email).toBe("ketoan@anser.dev");

    expect((await findUserByEmail("KETOAN@anser.DEV"))?.id).toBe(user.id);
    expect(await findUserByEmail("khac@anser.dev")).toBeUndefined();
  });

  it("không tạo được hai tài khoản cùng email chỉ khác hoa thường", async () => {
    await makeUser("ketoan@anser.dev");
    await expect(makeUser("KETOAN@anser.dev")).rejects.toMatchObject({
      cause: { code: "23505", constraint: "users_email_unique" },
    });
    expect(await db.select().from(users)).toHaveLength(1);
  });

  it("tài khoản mới mặc định là staff, phone và employeeId để trống là null", async () => {
    const user = await makeUser("moi@anser.dev");
    expect(user).toMatchObject({ role: "staff", phone: null, employeeId: null });
  });

  it("findUserById trả đúng tài khoản, id không tồn tại trả undefined", async () => {
    const user = await makeUser("a@anser.dev");
    expect((await findUserById(user.id))?.email).toBe("a@anser.dev");
    expect(await findUserById(MISSING_ID)).toBeUndefined();
  });

  it("listUsers xếp theo tên", async () => {
    // Email xếp ngược với tên để sắp theo email (hoặc theo thứ tự tạo) sẽ làm test đỏ.
    await makeUser("x@anser.dev", { firstName: "Cường" });
    await makeUser("z@anser.dev", { firstName: "An" });
    await makeUser("y@anser.dev", { firstName: "Bảo" });
    expect((await listUsers()).map((u) => u.firstName)).toEqual(["An", "Bảo", "Cường"]);
  });

  it("updateUser đổi vai trò mà không đụng tới các trường khác", async () => {
    const user = await createUser({
      firstName: "Lan",
      lastName: "Nguyễn",
      email: "lan@anser.dev",
      phone: "0901234567",
      passwordHash: "$2a$10$hash",
    });

    const updated = await updateUser(user.id, { role: "manager" });

    expect(updated).toMatchObject({ role: "manager", phone: "0901234567", passwordHash: "$2a$10$hash" });
    expect((await findUserById(user.id))?.role).toBe("manager");
  });

  it("updateUser với null thì xoá trường đó", async () => {
    const user = await createUser({
      firstName: "Lan",
      lastName: "Nguyễn",
      email: "lan@anser.dev",
      phone: "0901234567",
      passwordHash: "x",
    });
    expect(await updateUser(user.id, { phone: null })).toMatchObject({ phone: null, firstName: "Lan" });
  });

  it("updateUser với id không tồn tại trả undefined", async () => {
    expect(await updateUser(MISSING_ID, { role: "manager" })).toBeUndefined();
  });

  it("vai trò ngoài staff/manager/admin bị database từ chối", async () => {
    const user = await makeUser("a@anser.dev");
    await expect(updateUser(user.id, { role: "owner" as Role })).rejects.toMatchObject({
      cause: { code: "23514", constraint: "users_role_hop_le" },
    });
    expect((await findUserById(user.id))?.role).toBe("staff");
  });

  it.todo(
    "BUG: updateUser(id, { role: undefined }) ném 'No values to set' — PATCH /api/users/[id] không gửi role đi vào đây → 500 thay vì 400 hoặc trả tài khoản hiện tại",
  );

  it("countAdmins chỉ đếm admin", async () => {
    expect(await countAdmins()).toBe(0);
    const admin = await makeUser("admin1@anser.dev", { role: "admin" });
    await makeUser("admin2@anser.dev", { role: "admin" });
    await makeUser("ql@anser.dev", { role: "manager" });
    await makeUser("nv@anser.dev", { role: "staff" });
    expect(await countAdmins()).toBe(2);

    await updateUser(admin.id, { role: "staff" });
    expect(await countAdmins()).toBe(1);
  });

  it("deleteUser chỉ xoá đúng tài khoản đó", async () => {
    const gone = await makeUser("di@anser.dev");
    const kept = await makeUser("o@anser.dev");

    await deleteUser(gone.id);

    expect(await findUserById(gone.id)).toBeUndefined();
    expect((await db.select().from(users)).map((u) => u.id)).toEqual([kept.id]);
  });
});

describe("seedDemoUser", () => {
  it("lần đầu tạo tài khoản demo là admin, đăng nhập được bằng mật khẩu demo", async () => {
    await seedDemoUser();

    const demo = await findUserByEmail(DEMO_ACCOUNT.email);
    expect(demo).toMatchObject({ role: "admin", firstName: "Demo", lastName: "User" });
    expect(bcrypt.compareSync(DEMO_ACCOUNT.password, demo!.passwordHash)).toBe(true);
  });

  it("chạy lại không tạo thêm tài khoản và không đổi mật khẩu", async () => {
    await seedDemoUser();
    const first = await findUserByEmail(DEMO_ACCOUNT.email);

    await seedDemoUser();

    const rows = await db.select().from(users);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: first!.id, passwordHash: first!.passwordHash });
  });

  it("tài khoản demo đang là staff thì được nâng lại thành admin, giữ nguyên mật khẩu", async () => {
    const demo = await createUser({
      firstName: "Demo",
      lastName: "User",
      email: DEMO_ACCOUNT.email,
      passwordHash: "hash-cu",
      role: "staff",
    });

    await seedDemoUser();

    expect(await db.select().from(users)).toHaveLength(1);
    expect(await findUserById(demo.id)).toMatchObject({ role: "admin", passwordHash: "hash-cu" });
  });
});
