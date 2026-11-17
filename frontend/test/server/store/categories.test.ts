import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/client", () => import("@test/db"));

import { db, resetDb } from "@test/db";
import { categories } from "@/server/db/schema";
import {
  DEFAULT_CATEGORIES,
  EmptyCategoryNameError,
  getCategoryById,
  getOrCreateCategoryByName,
  listCategories,
  seedCategories,
} from "@/server/store/categories";

beforeEach(resetDb);

describe("getOrCreateCategoryByName", () => {
  it("cùng tên khác hoa thường thì trả cùng một danh mục, giữ cách viết đầu tiên", async () => {
    const first = await getOrCreateCategoryByName("Dầu nhớt");

    expect((await getOrCreateCategoryByName("dầu nhớt")).id).toBe(first.id);
    expect((await getOrCreateCategoryByName("DẦU NHỚT")).id).toBe(first.id);
    expect((await listCategories()).map((c) => c.name)).toEqual(["Dầu nhớt"]);
  });

  it("cắt khoảng trắng hai đầu và gộp khoảng trắng thừa trước khi lưu và so", async () => {
    const created = await getOrCreateCategoryByName("  Phụ   tùng\txe  ");
    expect(created.name).toBe("Phụ tùng xe");
    expect((await getOrCreateCategoryByName("phụ tùng xe")).id).toBe(created.id);
  });

  it("chữ gõ kiểu tổ hợp (NFD) khớp với chữ dựng sẵn (NFC) và được lưu dạng NFC", async () => {
    const decomposed = "Dầu nhớt".normalize("NFD");
    const created = await getOrCreateCategoryByName(decomposed);
    expect(created.name).toBe("Dầu nhớt".normalize("NFC"));
    expect((await getOrCreateCategoryByName("Dầu nhớt".normalize("NFC"))).id).toBe(created.id);
  });

  it("hai yêu cầu cùng lúc với cùng tên không tạo trùng mà cùng nhận một danh mục", async () => {
    const [a, b] = await Promise.all([getOrCreateCategoryByName("Dầu nhớt"), getOrCreateCategoryByName("DẦU NHỚT")]);
    expect(a.id).toBe(b.id);
    expect(await db.select().from(categories)).toHaveLength(1);
  });

  it("không tạo được mà cũng không tìm thấy thì ném lỗi chứ không trả undefined", async () => {
    // Quá giới hạn kích thước một dòng index btree (~2,7KB) nên INSERT hỏng vì lý do khác trùng tên.
    const huge = randomBytes(4500).toString("base64");
    await expect(getOrCreateCategoryByName(huge)).rejects.toThrow("Không thể tạo hoặc tìm danh mục");
    expect(await db.select().from(categories)).toHaveLength(0);
  });

  it.each(["", "   ", "\t \n"])("tên rỗng hoặc toàn khoảng trắng (%j) bị từ chối, không tạo danh mục", async (name) => {
    await expect(getOrCreateCategoryByName(name)).rejects.toThrow(EmptyCategoryNameError);
    expect(await db.select().from(categories)).toHaveLength(0);
  });
});

describe("categories schema", () => {
  it("database chặn chèn thẳng một tên trùng chỉ khác hoa thường", async () => {
    await db.insert(categories).values({ name: "Dầu nhớt" });
    await expect(db.insert(categories).values({ name: "DẦU NHỚT" })).rejects.toMatchObject({
      cause: { code: "23505", constraint: "categories_name_case_insensitive_unique" },
    });
  });
});

describe("đọc danh mục", () => {
  it("listCategories xếp theo tên; getCategoryById tìm theo id, không có thì undefined", async () => {
    const b = await getOrCreateCategoryByName("Bán thành phẩm");
    await getOrCreateCategoryByName("Thành phẩm");
    await getOrCreateCategoryByName("Phụ liệu");

    expect((await listCategories()).map((c) => c.name)).toEqual(["Bán thành phẩm", "Phụ liệu", "Thành phẩm"]);
    expect(await getCategoryById(b.id)).toMatchObject({ id: b.id, name: "Bán thành phẩm" });
    expect(await getCategoryById("00000000-0000-4000-8000-000000000000")).toBeUndefined();
  });
});

describe("seedCategories", () => {
  it("database trống thì tạo đủ bốn danh mục mặc định", async () => {
    const seeded = await seedCategories();
    expect(seeded.map((c) => c.name).sort()).toEqual([...DEFAULT_CATEGORIES].sort());
    expect(await listCategories()).toHaveLength(DEFAULT_CATEGORIES.length);
  });

  it("chạy lại không tạo trùng", async () => {
    await seedCategories();
    const again = await seedCategories();
    expect(again).toHaveLength(DEFAULT_CATEGORIES.length);
    expect(await listCategories()).toHaveLength(DEFAULT_CATEGORIES.length);
  });

  it("đã có danh mục do người dùng tạo thì không chèn bộ mặc định", async () => {
    await getOrCreateCategoryByName("Dầu nhớt");
    expect((await seedCategories()).map((c) => c.name)).toEqual(["Dầu nhớt"]);
  });
});
