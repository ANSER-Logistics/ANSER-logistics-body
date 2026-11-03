import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/client", () => import("@/test/db"));

// `getOrCreateCategoryByName` chạy SAU lapKeHoach và TRƯỚC db.transaction
// (ap-dung.ts:173-179) — khe duy nhất để chen một thay đổi vào giữa "xem trước"
// và "ghi". Bọc hàm thật: ghi lại tên được gọi, chạy móc một lần rồi gọi tiếp.
const seam = vi.hoisted(() => ({
  truocKhiGhi: undefined as (() => Promise<void>) | undefined,
  nhomDaGoi: [] as string[],
}));
vi.mock("@/server/store/categories", async (orig) => {
  const that = await orig<typeof import("@/server/store/categories")>();
  return {
    ...that,
    getOrCreateCategoryByName: async (ten: string) => {
      seam.nhomDaGoi.push(ten);
      const moc = seam.truocKhiGhi;
      seam.truocKhiGhi = undefined;
      await moc?.();
      return that.getOrCreateCategoryByName(ten);
    },
  };
});

import { asc, eq } from "drizzle-orm";
import { client, db, resetDb } from "@/test/db";
import {
  categories,
  customers,
  employees,
  inventoryTransactions,
  products,
  suppliers,
  warehouses,
} from "@/server/db/schema";
import type { DongDoc, KetQuaDoc, LoaiFile } from "./doc-excel";
import { apDung, lapKeHoach } from "./ap-dung";

beforeEach(resetDb);
beforeEach(() => {
  seam.truocKhiGhi = undefined;
  seam.nhomDaGoi = [];
});

let soDong = 1;
const dong = (d: Partial<DongDoc> & Pick<DongDoc, "code" | "name">): DongDoc => ({
  dongExcel: ++soDong,
  loi: [],
  canhBao: [],
  ...d,
});
const file = (loai: LoaiFile, ds: DongDoc[], canhBao: string[] = []): KetQuaDoc => ({
  loai,
  tenSheet: "Sheet1",
  dongTieuDe: 1,
  dong: ds,
  canhBao,
});

async function taoKho(name = "Kho chính") {
  const [k] = await db.insert(warehouses).values({ name }).returning();
  return k.id;
}

/** Mặt hàng đang có, kèm một dòng sổ kho để stock = SUM(quantity) ngay từ đầu. */
async function taoHang(warehouseId: string, v: Partial<typeof products.$inferInsert> & { code: string }) {
  const [p] = await db
    .insert(products)
    .values({ name: v.code, warehouseId, ...v })
    .returning();
  if (p.stock) {
    await db.insert(inventoryTransactions).values({ productId: p.id, warehouseId, type: "import", quantity: p.stock });
  }
  return p;
}

/** Mã các mặt hàng có stock khác SUM(quantity) — bất biến B1 đòi danh sách này rỗng. */
async function hangLech() {
  const { rows } = await client.query<{ code: string }>(`
    select p.code from products p
    left join inventory_transactions t on t.product_id = p.id
    group by p.id having p.stock <> coalesce(sum(t.quantity), 0)`);
  return rows.map((r) => r.code);
}

const hang = async (code: string) => (await db.select().from(products).where(eq(products.code, code)))[0];
const soKho = () => db.select().from(inventoryTransactions);

describe("lapKeHoach — hàng hoá", () => {
  it("tách dòng bỏ qua và dòng lỗi, chép cảnh báo của file", async () => {
    const tong = dong({ code: "", name: "", boQua: "dòng tổng cộng", loi: ["thiếu mã"] });
    const loi = dong({ code: "VT001", name: "", loi: ["thiếu tên"] });

    const kh = await lapKeHoach(file("hang_hoa", [tong, loi], ["Không thấy cột tên"]));

    expect(kh).toEqual({
      loai: "hang_hoa",
      themMoi: [],
      capNhat: [],
      khongDoi: [],
      loi: [loi],
      boQua: [tong],
      canhBao: ["Không thấy cột tên"],
    });
  });

  it("mã chưa có là thêm mới; mã đã có (không phân biệt hoa thường) là cập nhật hoặc không đổi; không ghi gì", async () => {
    const kho = await taoKho();
    const a = await taoHang(kho, {
      code: "VT001",
      name: "Dầu A",
      unit: "Lít",
      stock: 10,
      cost: 5000,
      isReducedVat: false,
    });
    const b = await taoHang(kho, { code: "VT002", name: "Dầu B", unit: "Lít", stock: 4 });

    const kh = await lapKeHoach(
      file("hang_hoa", [
        dong({ code: "vt001", name: "Dầu A", unit: "Lít", stock: 10, cost: 5000, isReducedVat: false }),
        dong({ code: "VT002", name: "Dầu B mới", unit: "Lít", stock: 4 }),
        dong({ code: "VT003", name: "Dầu C", stock: 1 }),
      ]),
    );

    expect(kh.themMoi.map((m) => m.dong.code)).toEqual(["VT003"]);
    expect(kh.themMoi[0].idHienTai).toBeUndefined();
    expect(kh.khongDoi).toMatchObject([{ idHienTai: a.id, thayDoi: [] }]);
    expect(kh.capNhat).toMatchObject([
      { idHienTai: b.id, thayDoi: [{ truong: "Tên", cu: "Dầu B", moi: "Dầu B mới" }] },
    ]);
    expect(await db.select().from(products)).toHaveLength(2);
  });

  it("liệt kê đúng từng trường đổi; NULL khác 0 và khác false theo cả hai chiều", async () => {
    const kho = await taoKho();
    await taoHang(kho, { code: "VT001", name: "A", unit: "Lít", stock: 10, cost: null, isReducedVat: null });
    await taoHang(kho, { code: "VT002", name: "B", unit: "Lít", stock: 0, cost: 0, isReducedVat: false });

    const kh = await lapKeHoach(
      file("hang_hoa", [
        dong({ code: "VT001", name: "A", unit: "Can", stock: 12.5, cost: 0, isReducedVat: false }),
        dong({ code: "VT002", name: "B", unit: "Lít", stock: 0, cost: null, isReducedVat: null }),
      ]),
    );

    expect(kh.capNhat.map((m) => m.thayDoi)).toEqual([
      [
        { truong: "Đơn vị tính", cu: "Lít", moi: "Can" },
        { truong: "Tồn kho", cu: 10, moi: 12.5 },
        { truong: "Giá vốn", cu: null, moi: 0 },
        { truong: "Giảm 2% VAT", cu: null, moi: false },
      ],
      [
        { truong: "Giá vốn", cu: 0, moi: null },
        { truong: "Giảm 2% VAT", cu: false, moi: null },
      ],
    ]);
  });

  it("trường file không nhắc tới (undefined) không tính là thay đổi", async () => {
    const kho = await taoKho();
    await taoHang(kho, { code: "VT001", name: "A", unit: "Lít", stock: 10, cost: 5000, isReducedVat: true });

    const kh = await lapKeHoach(file("hang_hoa", [dong({ code: "VT001", name: "A" })]));

    expect(kh.capNhat).toEqual([]);
    expect(kh.khongDoi).toHaveLength(1);
  });

  it("sai số dấu phẩy động không tính là đổi tồn", async () => {
    const kho = await taoKho();
    await taoHang(kho, { code: "VT001", name: "A", stock: 0.3 });

    const kh = await lapKeHoach(file("hang_hoa", [dong({ code: "VT001", name: "A", stock: 0.1 + 0.2 })]));

    expect(kh.khongDoi).toHaveLength(1);
  });

  it.todo(
    "BUG: lapKeHoach không so nhóm hàng (category) — đổi nhóm không hiện trong thayDoi; apDung chỉ ghi nhóm mới khi có trường khác cũng đổi",
  );
  it.fails("BUG repro: chỉ đổi nhóm hàng thì bị xếp vào khongDoi và nhóm mới không được ghi", async () => {
    const kho = await taoKho();
    const [cu] = await db.insert(categories).values({ name: "Cũ" }).returning();
    await taoHang(kho, { code: "VT001", name: "A", unit: "Lít", stock: 3, categoryId: cu.id });
    const kq = file("hang_hoa", [dong({ code: "VT001", name: "A", unit: "Lít", stock: 3, category: "Mới" })]);

    expect((await lapKeHoach(kq)).capNhat).toHaveLength(1);
    expect((await apDung(kq, kho)).sua).toBe(1);
    const [moi] = await db.select().from(categories).where(eq(categories.name, "Mới"));
    expect((await hang("VT001")).categoryId).toBe(moi?.id);
  });

  it.todo(
    "BUG: products.code unique PHÂN BIỆT hoa thường nhưng lapKeHoach gộp theo lower(code) — có cả 'VT001' và 'vt001' thì dòng 'VT001' nhắm vào 'vt001'",
  );
  it.fails("BUG repro: mã trùng khớp chính xác vẫn bị gộp với mã khác hoa thường", async () => {
    const kho = await taoKho();
    const hoa = await taoHang(kho, { code: "VT001", name: "Hoa" });
    await taoHang(kho, { code: "vt001", name: "Thường" }); // nạp sau -> đè lên key "vt001" trong map

    const kh = await lapKeHoach(file("hang_hoa", [dong({ code: "VT001", name: "Hoa" })]));

    expect(kh.khongDoi).toMatchObject([{ idHienTai: hoa.id }]);
  });
});

describe("lapKeHoach — khách hàng / nhà cung cấp", () => {
  it("khớp theo mã không phân biệt hoa thường, không khớp theo tên, không lẫn sang bảng nhà cung cấp", async () => {
    const [kh1] = await db
      .insert(customers)
      .values([
        {
          code: "KH001",
          name: "Cty An Phát",
          address: "12 Lê Lợi",
          taxCode: "0101",
          phone: "0901",
          openingDebt: 1_000_000,
        },
        { code: null, name: "Khách lẻ" },
      ])
      .returning();
    await db.insert(suppliers).values({ code: "NCC001", name: "Minh Long" });

    const kh = await lapKeHoach(
      file("khach_hang", [
        dong({
          code: "kh001",
          name: "Cty An Phát",
          address: "12 Lê Lợi",
          taxCode: "0101",
          phone: "0901",
          openingDebt: 1_000_000,
        }),
        dong({ code: "KH002", name: "Khách lẻ" }),
        dong({ code: "NCC001", name: "Minh Long" }),
      ]),
    );

    expect(kh.khongDoi).toMatchObject([{ idHienTai: kh1.id, thayDoi: [] }]);
    expect(kh.themMoi.map((m) => m.dong.code)).toEqual(["KH002", "NCC001"]);
  });

  it("nhà cung cấp: liệt kê đổi địa chỉ, MST, điện thoại, công nợ; công nợ null khác 0", async () => {
    await db
      .insert(suppliers)
      .values({ code: "NCC001", name: "A", address: "cũ", taxCode: "1", phone: "1", openingDebt: null });

    const kh = await lapKeHoach(
      file("nha_cung_cap", [
        dong({ code: "ncc001", name: "A", address: "mới", taxCode: "2", phone: "2", openingDebt: 0 }),
      ]),
    );

    expect(kh.capNhat[0].thayDoi).toEqual([
      { truong: "Địa chỉ", cu: "cũ", moi: "mới" },
      { truong: "Mã số thuế", cu: "1", moi: "2" },
      { truong: "Điện thoại", cu: "1", moi: "2" },
      { truong: "Công nợ", cu: null, moi: 0 },
    ]);
  });

  it("ô trống (undefined) không tính là đổi địa chỉ, MST, điện thoại, công nợ", async () => {
    const [cu] = await db
      .insert(customers)
      .values({
        code: "KH001",
        name: "Cty A",
        address: "12 Lê Lợi",
        taxCode: "0101",
        phone: "0901",
        openingDebt: 500,
      })
      .returning();

    const kh = await lapKeHoach(file("khach_hang", [dong({ code: "KH001", name: "Cty A" })]));

    expect(kh.capNhat).toEqual([]);
    expect(kh.khongDoi).toMatchObject([{ idHienTai: cu.id, thayDoi: [] }]);
  });
});

describe("apDung — hàng hoá", () => {
  it("từ chối khi chưa chọn kho và không ghi gì, kể cả nhóm hàng", async () => {
    const kq = file("hang_hoa", [dong({ code: "VT001", name: "A", category: "Dầu nhớt", stock: 3 })]);

    await expect(apDung(kq)).rejects.toThrow("Chưa chọn kho");
    expect(await db.select().from(products)).toEqual([]);
    expect(await db.select().from(categories)).toEqual([]);
  });

  it("thêm mới: ghi mặt hàng và một dòng adjustment có dấu bằng tồn đầu; NULL vẫn là NULL", async () => {
    const kho = await taoKho();
    const [nv] = await db.insert(employees).values({ name: "Thủ kho" }).returning();

    const ra = await apDung(
      file("hang_hoa", [
        dong({
          code: "VT001",
          name: "Dầu A",
          unit: "Lít",
          category: "Dầu nhớt",
          stock: 12.5,
          cost: 40000,
          isReducedVat: true,
        }),
        dong({ code: "VT002", name: "Phụ tùng", unit: "", stock: 0, cost: null, isReducedVat: null }),
        dong({ code: "VT003", name: "Âm kho", stock: -2 }),
      ]),
      kho,
      nv.id,
    );

    expect(ra).toEqual({ them: 3, sua: 0, boQua: 0, loi: [] });
    const [nhom] = await db.select().from(categories);
    expect(nhom.name).toBe("Dầu nhớt");
    expect(await hang("VT001")).toMatchObject({
      warehouseId: kho,
      categoryId: nhom.id,
      unit: "Lít",
      stock: 12.5,
      cost: 40000,
      isReducedVat: true,
    });
    expect(await hang("VT002")).toMatchObject({
      unit: "Cái",
      stock: 0,
      cost: null,
      isReducedVat: null,
      categoryId: null,
    });
    expect(await hang("VT003")).toMatchObject({ stock: -2, cost: null, isReducedVat: null });

    const vt1 = await hang("VT001");
    const vt3 = await hang("VT003");
    const so = await soKho();
    expect(so).toHaveLength(2); // tồn 0 thì không có dòng nào (CHECK quantity <> 0)
    expect(so.find((t) => t.productId === vt1.id)).toMatchObject({
      type: "adjustment",
      quantity: 12.5,
      unitCost: 40000,
      warehouseId: kho,
      employeeId: nv.id,
      sourceType: null,
      sourceId: null,
      note: "Nhập Excel MISA: tồn đầu 12.5",
    });
    expect(so.find((t) => t.productId === vt3.id)).toMatchObject({ quantity: -2, unitCost: null });
    expect(await hangLech()).toEqual([]);
  });

  it("cập nhật: dòng adjustment bằng chênh lệch với tồn hiện tại, ghi theo kho của mặt hàng, kèm nhân viên", async () => {
    const khoA = await taoKho("Kho A");
    const khoB = await taoKho("Kho B");
    const [nv] = await db.insert(employees).values({ name: "Thủ kho" }).returning();
    const [cu] = await db.insert(categories).values({ name: "Cũ" }).returning();
    const truoc = new Date("2020-01-01");
    const p = await taoHang(khoA, {
      code: "VT001",
      name: "Dầu A",
      unit: "Lít",
      stock: 7,
      cost: 1000,
      categoryId: cu.id,
      updatedAt: truoc,
    });

    const ra = await apDung(
      file("hang_hoa", [
        dong({
          code: "vt001",
          name: "Dầu A mới",
          unit: "Lít",
          category: "Mới",
          stock: 12,
          cost: 1200,
          isReducedVat: false,
        }),
      ]),
      khoB,
      nv.id,
    );

    expect(ra).toEqual({ them: 0, sua: 1, boQua: 0, loi: [] });
    const [moi] = await db.select().from(categories).where(eq(categories.name, "Mới"));
    const sau = await hang("VT001");
    expect(sau).toMatchObject({
      id: p.id,
      name: "Dầu A mới",
      stock: 12,
      cost: 1200,
      isReducedVat: false,
      warehouseId: khoA,
      categoryId: moi.id,
    });
    expect(sau.updatedAt.getTime()).toBeGreaterThan(truoc.getTime());
    const dieuChinh = (await soKho()).filter((t) => t.type === "adjustment");
    expect(dieuChinh).toMatchObject([
      {
        productId: p.id,
        quantity: 5,
        warehouseId: khoA,
        unitCost: 1200,
        employeeId: nv.id,
        note: "Nhập Excel MISA: điều chỉnh tồn 7 → 12",
      },
    ]);
    expect(await hangLech()).toEqual([]);
  });

  it("chênh lệch tính trên tồn đọc lại trong giao dịch, không phải tồn lúc xem trước", async () => {
    const kho = await taoKho();
    const p = await taoHang(kho, { code: "VT001", name: "A", stock: 7 });
    // Một phiếu xuất 2 chen vào giữa lúc xem trước (thấy 7) và lúc ghi.
    seam.truocKhiGhi = async () => {
      await db
        .insert(inventoryTransactions)
        .values({ productId: p.id, warehouseId: kho, type: "export", quantity: -2 });
      await db.update(products).set({ stock: 5 }).where(eq(products.id, p.id));
    };

    await apDung(file("hang_hoa", [dong({ code: "VT001", name: "A", stock: 12, category: "X" })]), kho);

    expect((await soKho()).filter((t) => t.type === "adjustment")).toMatchObject([
      { quantity: 7, note: "Nhập Excel MISA: điều chỉnh tồn 5 → 12" },
    ]);
    expect((await hang("VT001")).stock).toBe(12);
    expect(await hangLech()).toEqual([]);
  });

  it("mặt hàng bị xoá giữa lúc xem trước và lúc ghi: lỗi, rollback cả lượt", async () => {
    const kho = await taoKho();
    const p = await taoHang(kho, { code: "VT001", name: "A" });
    seam.truocKhiGhi = async () => {
      await db.delete(products).where(eq(products.id, p.id));
    };

    await expect(
      apDung(
        file("hang_hoa", [
          dong({ code: "VT002", name: "Mới", stock: 3, category: "X" }),
          dong({ code: "VT001", name: "A đổi tên", stock: 1 }),
        ]),
        kho,
      ),
    ).rejects.toThrow();

    expect(await db.select().from(products)).toEqual([]);
    expect(await soKho()).toEqual([]);
  });

  it("cập nhật không có nhóm thì giữ nhóm cũ; tồn không đổi thì không sinh dòng sổ kho", async () => {
    const kho = await taoKho();
    const [nhom] = await db.insert(categories).values({ name: "Phụ liệu" }).returning();
    await taoHang(kho, { code: "VT001", name: "Cũ", unit: "Lít", stock: 5, cost: 100, categoryId: nhom.id });

    const ra = await apDung(
      file("hang_hoa", [dong({ code: "VT001", name: "Mới", unit: "Lít", stock: 5, cost: 100 })]),
      kho,
    );

    expect(ra.sua).toBe(1);
    expect(await hang("VT001")).toMatchObject({ name: "Mới", categoryId: nhom.id, stock: 5 });
    expect(await soKho()).toHaveLength(1);
  });

  it("chênh lệch tồn dưới 0,001 làm tròn về 0 — không ghi dòng rác, không vỡ CHECK quantity <> 0", async () => {
    const kho = await taoKho();
    await taoHang(kho, { code: "VT001", name: "A", stock: 5 });

    await apDung(file("hang_hoa", [dong({ code: "VT001", name: "A", stock: 5.0004 })]), kho);

    expect(await soKho()).toHaveLength(1);
    expect(await hangLech()).toEqual([]);
  });

  it.todo(
    "BUG: tồn quá 3 chữ số thập phân (5.0004) luôn bị báo 'Tồn kho' đổi và đếm vào sua, dù numeric(14,3) chỉ lưu 5.000 — nhập lại không bao giờ là 'không đổi'",
  );
  it.fails("BUG repro: tồn 5.0004 với tồn đang có 5 vẫn bị xếp vào capNhat", async () => {
    const kho = await taoKho();
    await taoHang(kho, { code: "VT001", name: "A", stock: 5 });

    expect(await apDung(file("hang_hoa", [dong({ code: "VT001", name: "A", stock: 5.0004 })]), kho)).toEqual({
      them: 0,
      sua: 0,
      boQua: 1,
      loi: [],
    });
  });

  it("nhập lại cùng một file là không làm gì; dòng lỗi được báo kèm số dòng Excel", async () => {
    const kho = await taoKho();
    const kq = file("hang_hoa", [
      dong({ code: "VT001", name: "Dầu A", unit: "Lít", category: "Dầu nhớt", stock: 3, cost: 100 }),
      dong({ code: "VT002", name: "Dầu B", unit: "Lít", stock: 0, cost: null, isReducedVat: null }),
      dong({ code: "", name: "", boQua: "dòng tổng cộng" }),
      dong({
        dongExcel: 9,
        code: "VT009",
        name: "",
        category: "Rác",
        loi: ["thiếu tên", "mã trùng với dòng khác trong cùng file"],
      }),
    ]);

    const lan1 = await apDung(kq, kho);
    expect(lan1).toEqual({
      them: 2,
      sua: 0,
      boQua: 1,
      loi: ["dòng 9: thiếu tên, mã trùng với dòng khác trong cùng file"],
    });
    const sp = await db.select().from(products).orderBy(asc(products.code));
    const so = await soKho();

    const lan2 = await apDung(kq, kho);
    expect(lan2).toEqual({ them: 0, sua: 0, boQua: 3, loi: lan1.loi });
    expect(await db.select().from(products).orderBy(asc(products.code))).toEqual(sp);
    expect(await soKho()).toEqual(so);
    expect((await db.select().from(categories)).map((c) => c.name)).toEqual(["Dầu nhớt"]);
  });

  it("mỗi tên nhóm chỉ tra/tạo một lần; mặt hàng cùng tên nhóm dùng chung categoryId; nhóm đã có được dùng lại", async () => {
    const kho = await taoKho();
    const [dauNhot] = await db.insert(categories).values({ name: "Dầu nhớt" }).returning();

    await apDung(
      file("hang_hoa", [
        dong({ code: "VT001", name: "A", category: "dầu nhớt" }),
        dong({ code: "VT002", name: "B", category: "Phụ tùng" }),
        dong({ code: "VT003", name: "C", category: "Phụ tùng" }),
      ]),
      kho,
    );

    expect(seam.nhomDaGoi).toEqual(["dầu nhớt", "Phụ tùng"]);
    expect((await db.select().from(categories).orderBy(asc(categories.name))).map((c) => c.name)).toEqual([
      "Dầu nhớt",
      "Phụ tùng",
    ]);
    expect((await hang("VT001")).categoryId).toBe(dauNhot.id);
    expect((await hang("VT002")).categoryId).toBe((await hang("VT003")).categoryId);
  });

  it("lỗi giữa chừng thì rollback cả lượt — không còn mặt hàng hay dòng sổ kho nào; nhóm tạo trước giao dịch thì ở lại", async () => {
    const kho = await taoKho();
    // Hai dòng cùng mã lọt qua bộ đọc: dòng thứ hai vỡ unique `products.code`.
    const kq = file("hang_hoa", [
      dong({ code: "VT001", name: "A", stock: 1, category: "Dầu nhớt" }),
      dong({ code: "VT001", name: "B", stock: 2 }),
    ]);

    await expect(apDung(kq, kho)).rejects.toThrow();
    expect(await db.select().from(products)).toEqual([]);
    expect(await soKho()).toEqual([]);
    // Đánh đổi có chủ đích (ap-dung.ts:169-171): nhóm tạo ngoài giao dịch nên không rollback.
    expect((await db.select().from(categories)).map((c) => c.name)).toEqual(["Dầu nhớt"]);
  });

  it.todo(
    'BUG: apDung cập nhật hàng hoá ghi `stock ?? 0` / `unit || "Cái"` / `cost ?? null` — trường undefined bị ghi đè dù lapKeHoach báo giữ nguyên',
  );
  it.fails("BUG repro: cập nhật hàng hoá — trường undefined bị ghi đè, tồn bị đưa về 0", async () => {
    const kho = await taoKho();
    await taoHang(kho, { code: "VT001", name: "A", unit: "Lít", stock: 10, cost: 5000, isReducedVat: true });

    await apDung(file("hang_hoa", [dong({ code: "VT001", name: "B" })]), kho);

    expect(await hang("VT001")).toMatchObject({ name: "B", unit: "Lít", stock: 10, cost: 5000, isReducedVat: true });
    expect(await soKho()).toHaveLength(1);
  });
});

describe("apDung — khách hàng / nhà cung cấp", () => {
  it("khách hàng: sửa theo mã không phân biệt hoa thường, thêm mới với trường thiếu là NULL, không cần kho", async () => {
    const [cu] = await db.insert(customers).values({ code: "KH001", name: "Cty A", openingDebt: 0 }).returning();

    const ra = await apDung(
      file("khach_hang", [
        dong({
          code: "kh001",
          name: "Công ty A",
          address: "1 Hàng Bài",
          taxCode: "0101",
          phone: "0901",
          openingDebt: 2_500_000.5,
        }),
        dong({ code: "KH002", name: "Khách mới", openingDebt: null }),
      ]),
    );

    expect(ra).toEqual({ them: 1, sua: 1, boQua: 0, loi: [] });
    const rows = await db.select().from(customers).orderBy(asc(customers.code));
    expect(rows).toMatchObject([
      {
        id: cu.id,
        code: "KH001",
        name: "Công ty A",
        address: "1 Hàng Bài",
        taxCode: "0101",
        phone: "0901",
        openingDebt: 2_500_000.5,
      },
      { code: "KH002", name: "Khách mới", address: null, taxCode: null, phone: null, openingDebt: null },
    ]);
  });

  it("nhà cung cấp: ghi vào bảng suppliers, không đụng customers; nhập lại là không làm gì", async () => {
    await db.insert(suppliers).values({ code: "NCC001", name: "A" });
    const kq = file("nha_cung_cap", [dong({ code: "NCC001", name: "B" }), dong({ code: "NCC002", name: "C" })]);

    expect(await apDung(kq)).toEqual({ them: 1, sua: 1, boQua: 0, loi: [] });
    expect((await db.select().from(suppliers).orderBy(asc(suppliers.code))).map((s) => s.name)).toEqual(["B", "C"]);
    expect(await db.select().from(customers)).toEqual([]);

    expect(await apDung(kq)).toEqual({ them: 0, sua: 0, boQua: 2, loi: [] });
  });

  it.todo(
    "BUG: apDung cập nhật đối tác ghi `address/taxCode/phone ?? null` — ô trống (undefined) xoá dữ liệu đang có dù lapKeHoach báo giữ nguyên",
  );
  it.fails("BUG repro: cập nhật đối tác — ô trống (undefined) xoá địa chỉ/MST/điện thoại", async () => {
    await db
      .insert(customers)
      .values({ code: "KH001", name: "Cty A", address: "12 Lê Lợi", taxCode: "0101", phone: "0901" });

    await apDung(file("khach_hang", [dong({ code: "KH001", name: "Công ty A", openingDebt: null })]));

    expect((await db.select().from(customers))[0]).toMatchObject({
      name: "Công ty A",
      address: "12 Lê Lợi",
      taxCode: "0101",
      phone: "0901",
    });
  });
});
