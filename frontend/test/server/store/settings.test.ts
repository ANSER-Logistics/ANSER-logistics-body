import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/client", () => import("@test/db"));

import { db, resetDb } from "@test/db";
import { companySettings } from "@/server/db/schema";
import { ensureCompanySettingsRow, getCompanySettings, updateCompanySettings } from "@/server/store/settings";

beforeEach(resetDb);
afterEach(() => {
  vi.useRealTimers();
});

describe("company settings store", () => {
  it("database trống thì tạo đúng một dòng mặc định ANSER / VND", async () => {
    const settings = await getCompanySettings();
    expect(settings).toMatchObject({
      name: "ANSER",
      currency: "VND",
      address: null,
      phone: null,
      email: null,
      taxCode: null,
    });
    expect(await db.select().from(companySettings)).toHaveLength(1);
  });

  it("gọi nhiều lần vẫn chỉ có một dòng", async () => {
    const first = await ensureCompanySettingsRow();
    const second = await getCompanySettings();
    expect(second.id).toBe(first.id);
    expect(await db.select().from(companySettings)).toHaveLength(1);
  });

  it("updateCompanySettings trên database trống vẫn tạo dòng rồi ghi", async () => {
    const updated = await updateCompanySettings({ name: "Công ty Dầu nhớt An Phát" });
    expect(updated.name).toBe("Công ty Dầu nhớt An Phát");
    expect(await db.select().from(companySettings)).toHaveLength(1);
  });

  it("trường undefined giữ nguyên giá trị cũ, null thì xoá", async () => {
    await updateCompanySettings({ address: "12 Cầu Giấy, Hà Nội", phone: "0241234567", taxCode: "0101234567" });

    // Route PATCH gửi undefined cho mọi trường người dùng không đụng tới.
    const updated = await updateCompanySettings({
      name: undefined,
      address: undefined,
      phone: null,
      email: "lienhe@anser.dev",
      taxCode: undefined,
      currency: "USD",
    });

    expect(updated).toMatchObject({
      name: "ANSER",
      address: "12 Cầu Giấy, Hà Nội",
      phone: null,
      email: "lienhe@anser.dev",
      taxCode: "0101234567",
      currency: "USD",
    });
  });

  it("mỗi lần cập nhật ghi lại updatedAt", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    await ensureCompanySettingsRow();

    const later = new Date("2026-06-01T08:30:00Z");
    vi.setSystemTime(later);
    const updated = await updateCompanySettings({ phone: "0241234567" });

    expect(updated.updatedAt.getTime()).toBe(later.getTime());
  });
});
