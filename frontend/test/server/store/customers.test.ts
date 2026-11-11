import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/client", () => import("@test/db"));

import { db, resetDb } from "@test/db";
import { salesInvoices } from "@/server/db/schema";
import {
  createCustomer,
  customerType,
  deleteCustomer,
  getCustomerById,
  listCustomers,
  updateCustomer,
} from "@/server/store/customers";

beforeEach(resetDb);

describe("customerType", () => {
  it("chưa có hoá đơn nào là khách mới", () => {
    expect(customerType(0)).toBe("Khách hàng mới");
  });

  it("có từ một hoá đơn là khách cũ", () => {
    expect(customerType(1)).toBe("Khách hàng cũ");
  });
});

describe("customers store", () => {
  it("tạo, đọc, sửa, xoá một khách hàng", async () => {
    const created = await createCustomer({ name: "Cửa hàng An Phát", phone: "0901234567" });
    expect(created.id).toBeTruthy();

    expect(await getCustomerById(created.id)).toMatchObject({ name: "Cửa hàng An Phát", phone: "0901234567" });

    const updated = await updateCustomer(created.id, { phone: null, note: "giao buổi sáng" });
    expect(updated).toMatchObject({ phone: null, note: "giao buổi sáng" });

    await deleteCustomer(created.id);
    expect(await getCustomerById(created.id)).toBeUndefined();
  });

  it("listCustomers tìm không phân biệt hoa thường và xếp theo tên", async () => {
    await createCustomer({ name: "Bách Hoá Xanh" });
    await createCustomer({ name: "an phát" });
    await createCustomer({ name: "Minh Long" });

    expect((await listCustomers()).map((c) => c.name)).toEqual(["Bách Hoá Xanh", "Minh Long", "an phát"]);
    expect((await listCustomers("AN P")).map((c) => c.name)).toEqual(["an phát"]);
  });

  it("listCustomers cộng số hoá đơn và tổng chi tiêu; khách chưa mua có 0 và lastOrderAt null", async () => {
    const buyer = await createCustomer({ name: "Khách có mua" });
    await createCustomer({ name: "Khách chưa mua" });
    await db.insert(salesInvoices).values([
      { customerId: buyer.id, customerName: buyer.name, total: 150_000 },
      { customerId: buyer.id, customerName: buyer.name, total: 50_000 },
    ]);

    const byName = Object.fromEntries((await listCustomers()).map((c) => [c.name, c]));
    expect(byName["Khách có mua"]).toMatchObject({ invoiceCount: 2, totalSpent: 200_000 });
    expect(byName["Khách có mua"].lastOrderAt).not.toBeNull();
    expect(byName["Khách chưa mua"]).toMatchObject({ invoiceCount: 0, totalSpent: 0, lastOrderAt: null });
  });
});
