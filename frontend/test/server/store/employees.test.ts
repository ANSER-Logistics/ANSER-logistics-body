import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/client", () => import("@test/db"));

import { resetDb } from "@test/db";
import {
  createEmployee,
  deleteEmployee,
  getEmployeeById,
  listEmployees,
  updateEmployee,
} from "@/server/store/employees";
import { createUser, findUserById } from "@/server/store/users";
import { createWarehouse } from "@/server/store/warehouses";

beforeEach(resetDb);

const MISSING_ID = "00000000-0000-4000-8000-000000000000";

describe("employees store", () => {
  it("chỉ có tên thì các trường còn lại là null, không phải chuỗi rỗng", async () => {
    const employee = await createEmployee({ name: "Phạm Văn Hùng" });
    expect(employee).toMatchObject({
      name: "Phạm Văn Hùng",
      position: null,
      phone: null,
      email: null,
      hireDate: null,
      warehouseId: null,
      note: null,
    });
  });

  it("tạo đủ trường rồi đọc lại đúng từng trường", async () => {
    const kho = await createWarehouse("Kho Hà Nội");
    const hireDate = new Date("2025-03-15T00:00:00Z");
    const created = await createEmployee({
      name: "Lê Thị Mai",
      position: "Thủ kho",
      phone: "0912345678",
      email: "mai@anser.dev",
      hireDate,
      warehouseId: kho.id,
      note: "ca sáng",
    });

    expect(await getEmployeeById(created.id)).toMatchObject({
      name: "Lê Thị Mai",
      position: "Thủ kho",
      phone: "0912345678",
      email: "mai@anser.dev",
      hireDate,
      warehouseId: kho.id,
      note: "ca sáng",
    });
  });

  it("getEmployeeById với id không tồn tại trả undefined", async () => {
    expect(await getEmployeeById(MISSING_ID)).toBeUndefined();
  });

  it("listEmployees xếp theo tên", async () => {
    await createEmployee({ name: "Cao Văn Dũng" });
    await createEmployee({ name: "An Thị Hoa" });
    await createEmployee({ name: "Bùi Minh Tú" });
    expect((await listEmployees()).map((e) => e.name)).toEqual(["An Thị Hoa", "Bùi Minh Tú", "Cao Văn Dũng"]);
  });

  it("updateEmployee chỉ sửa trường được gửi, null thì xoá trường đó", async () => {
    const created = await createEmployee({ name: "Lê Thị Mai", position: "Thủ kho", phone: "0912345678" });

    const updated = await updateEmployee(created.id, { position: "Trưởng kho", phone: null });

    expect(updated).toMatchObject({ name: "Lê Thị Mai", position: "Trưởng kho", phone: null });
    expect(await getEmployeeById(created.id)).toMatchObject({ position: "Trưởng kho", phone: null });
  });

  it("updateEmployee với id không tồn tại trả undefined", async () => {
    expect(await updateEmployee(MISSING_ID, { name: "Ai đó" })).toBeUndefined();
  });

  it("updateEmployee không có trường nào để đổi thì trả nhân viên hiện tại, không ném lỗi", async () => {
    const employee = await createEmployee({ name: "Phạm Văn Hùng" });
    expect(await updateEmployee(employee.id, {})).toMatchObject({ id: employee.id, name: "Phạm Văn Hùng" });
    expect(await updateEmployee("00000000-0000-4000-8000-000000000000", {})).toBeUndefined();
  });

  it("xoá nhân viên thì tài khoản gắn với họ vẫn còn nhưng bị gỡ liên kết", async () => {
    const employee = await createEmployee({ name: "Lê Thị Mai" });
    const other = await createEmployee({ name: "Bùi Minh Tú" });
    const user = await createUser({
      firstName: "Mai",
      lastName: "Lê",
      email: "mai@anser.dev",
      passwordHash: "x",
      employeeId: employee.id,
    });

    await deleteEmployee(employee.id);

    expect(await getEmployeeById(employee.id)).toBeUndefined();
    expect(await getEmployeeById(other.id)).toMatchObject({ id: other.id, name: "Bùi Minh Tú" });
    expect(await findUserById(user.id)).toMatchObject({ id: user.id, employeeId: null });
  });
});
