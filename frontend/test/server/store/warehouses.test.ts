import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/client", () => import("@test/db"));

import { db, resetDb } from "@test/db";
import { warehouses } from "@/server/db/schema";
import { createWarehouse, listWarehouses, updateWarehouse } from "@/server/store/warehouses";

beforeEach(resetDb);

describe("warehouses store", () => {
  it("kho mới chưa có email báo và không cho phép giá trị 0", async () => {
    const kho = await createWarehouse("Kho Hà Nội");
    expect(kho).toMatchObject({ name: "Kho Hà Nội", notificationEmail: null, allowsZeroValue: false });
  });

  it("trùng tên kho thì báo lỗi tiếng Việt và không tạo thêm", async () => {
    await createWarehouse("Kho Hà Nội");
    await expect(createWarehouse("Kho Hà Nội")).rejects.toThrow("Tên kho đã tồn tại.");
    expect(await db.select().from(warehouses)).toHaveLength(1);
  });

  it("listWarehouses xếp theo tên", async () => {
    await createWarehouse("Kho Sài Gòn");
    await createWarehouse("Kho Bắc Ninh");
    await createWarehouse("Kho Hà Nội");
    expect((await listWarehouses()).map((w) => w.name)).toEqual(["Kho Bắc Ninh", "Kho Hà Nội", "Kho Sài Gòn"]);
  });

  it("updateWarehouse đặt rồi xoá email báo, không đụng tên kho", async () => {
    const kho = await createWarehouse("Kho Hà Nội");

    expect(await updateWarehouse(kho.id, { notificationEmail: "kho@anser.dev" })).toMatchObject({
      name: "Kho Hà Nội",
      notificationEmail: "kho@anser.dev",
    });
    expect(await updateWarehouse(kho.id, { notificationEmail: null })).toMatchObject({ notificationEmail: null });
    expect((await listWarehouses())[0].notificationEmail).toBeNull();
  });

  it("updateWarehouse với id không tồn tại trả undefined", async () => {
    expect(
      await updateWarehouse("00000000-0000-4000-8000-000000000000", { notificationEmail: "x@anser.dev" }),
    ).toBeUndefined();
  });

  it.todo(
    "BUG: updateWarehouse(id, {}) ném 'No values to set' — PATCH /api/warehouses/[id] với body không có notificationEmail đi vào đây → 500 thay vì 400 hoặc trả kho hiện tại",
  );
});
