import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/client", () => import("@/test/db"));

import { db, resetDb } from "@/test/db";
import { products, salesInvoiceItems, salesInvoices, warehouses } from "@/server/db/schema";
import { deleteProduct, updateProduct } from "@/server/store/products";
import { collectSaleLines } from "./brainReport";

// Chỉ giả Date (không giả setTimeout) để cửa sổ "N tháng gần nhất" cố định mà
// PGlite vẫn chạy bình thường. NOW = 12:00 ngày 15/06/2026 giờ VN.
const NOW = new Date("2026-06-15T05:00:00Z");

beforeEach(async () => {
  await resetDb();
  // Ghim múi giờ của dự án để kết quả không đổi theo máy chạy test (CI thường là UTC).
  vi.stubEnv("TZ", "Asia/Ho_Chi_Minh");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function taoKho(name: string) {
  const [kho] = await db.insert(warehouses).values({ name }).returning();
  return kho;
}

async function taoSanPham(warehouseId: string, code: string, name: string, cost: number | null) {
  const [sp] = await db.insert(products).values({ code, name, warehouseId, price: 10_000, cost }).returning();
  return sp;
}

type Dong = {
  productId: string;
  productName: string;
  quantity: number;
  lineTotal: number;
  unitCost: number | null;
};

/** Một hoá đơn bán tại thời điểm `createdAt` với các dòng `dong` (đơn giá luôn 10.000). */
async function ban(warehouseId: string | null, createdAt: string, dong: Dong[]) {
  const [hd] = await db
    .insert(salesInvoices)
    .values({
      customerName: "Khách lẻ",
      warehouseId,
      total: dong.reduce((s, d) => s + d.lineTotal, 0),
      createdAt: new Date(createdAt),
    })
    .returning();
  await db.insert(salesInvoiceItems).values(
    dong.map((d) => ({ ...d, invoiceId: hd.id, unitPrice: 10_000 })),
  );
  return hd;
}

function dong(productId: string, productName: string, extra: Partial<Dong> = {}): Dong {
  return { productId, productName, quantity: 1, lineTotal: 10_000, unitCost: null, ...extra };
}

describe("collectSaleLines", () => {
  it("không có kho nào thì trả rỗng, kể cả khi DB có dòng bán", async () => {
    const kho = await taoKho("Kho Hà Nội");
    const sp = await taoSanPham(kho.id, "VT001", "Dầu nhớt 1L", 5_000);
    await ban(kho.id, "2026-06-01T03:00:00Z", [dong(sp.id, sp.name)]);

    expect(await collectSaleLines({ warehouseIds: [] })).toEqual({ lines: [], withCost: 0, total: 0 });
  });

  it("chưa bán gì thì total = 0", async () => {
    const kho = await taoKho("Kho Hà Nội");
    expect(await collectSaleLines({ warehouseIds: [kho.id] })).toEqual({ lines: [], withCost: 0, total: 0 });
  });

  it("mỗi dòng có ngày YYYY-MM-DD, doanh thu = lineTotal, tên snapshot lúc bán, số lượng lẻ giữ nguyên", async () => {
    const kho = await taoKho("Kho Hà Nội");
    // Sản phẩm đã đổi tên sau khi bán — báo cáo phải dùng tên lúc bán.
    const sp = await taoSanPham(kho.id, "VT001", "Dầu nhớt 1L (mẫu mới)", 9_000);
    // Dòng có chiết khấu: lineTotal 14.000 ≠ đơn giá 10.000 × 1,5.
    await ban(kho.id, "2026-05-10T03:00:00Z", [
      dong(sp.id, "Dầu nhớt 1L", { quantity: 1.5, lineTotal: 14_000, unitCost: 4_000 }),
    ]);

    expect(await collectSaleLines({ warehouseIds: [kho.id] })).toEqual({
      lines: [{ date: "2026-05-10", revenue: 14_000, product: "Dầu nhớt 1L", quantity: 1.5, cogs: 6_000 }],
      withCost: 1,
      total: 1,
    });
  });

  it("giá vốn: snapshot lúc bán > giá vốn hiện hành > null; 0 là đã biết, không phải chưa biết", async () => {
    const kho = await taoKho("Kho Hà Nội");
    const coGia = await taoSanPham(kho.id, "VT001", "Dầu nhớt", 9_000);
    const chuaGia = await taoSanPham(kho.id, "VT002", "Mỡ bò", null);
    const hangTang = await taoSanPham(kho.id, "KM001", "Khăn lau", 5_000);
    const giaVon0 = await taoSanPham(kho.id, "KM002", "Túi nilon", 0);
    await ban(kho.id, "2026-06-01T03:00:00Z", [
      dong(coGia.id, "snapshot", { quantity: 2, unitCost: 7_000 }),
      dong(coGia.id, "giá hiện hành", { quantity: 3, unitCost: null }),
      dong(chuaGia.id, "chưa biết", { quantity: 1, unitCost: null }),
      dong(hangTang.id, "tặng kèm", { quantity: 4, unitCost: 0 }),
      dong(giaVon0.id, "giá vốn hiện hành 0", { quantity: 2, unitCost: null }),
    ]);

    const { lines, withCost, total } = await collectSaleLines({ warehouseIds: [kho.id] });
    const cogs = Object.fromEntries(lines.map((l) => [l.product, l.cogs]));

    expect(cogs).toEqual({
      snapshot: 14_000,
      "giá hiện hành": 27_000,
      // Không được quy về 0 — 0 nghĩa là lãi 100%.
      "chưa biết": null,
      "tặng kèm": 0,
      "giá vốn hiện hành 0": 0,
    });
    expect({ withCost, total }).toEqual({ withCost: 4, total: 5 });
  });

  it("mặc định lấy 12 tháng gần nhất", async () => {
    const kho = await taoKho("Kho Hà Nội");
    const sp = await taoSanPham(kho.id, "VT001", "Dầu nhớt", 5_000);
    // Sát mép cửa sổ (15/06/2025) để mặc định 13 tháng cũng phải đỏ.
    await ban(kho.id, "2025-06-16T12:00:00Z", [dong(sp.id, "trong 12 tháng")]);
    await ban(kho.id, "2025-06-13T12:00:00Z", [dong(sp.id, "quá 12 tháng")]);

    const { lines } = await collectSaleLines({ warehouseIds: [kho.id] });

    expect(lines.map((l) => l.product)).toEqual(["trong 12 tháng"]);
  });

  it("cửa sổ bắt đầu từ 00:00 giờ VN của ngày đầu, không phải từ giờ hiện tại", async () => {
    const kho = await taoKho("Kho Hà Nội");
    const sp = await taoSanPham(kho.id, "VT001", "Dầu nhớt", 5_000);
    // Ngày đầu cửa sổ: 00:00 15/06/2025 giờ VN = 17:00Z 14/06.
    await ban(kho.id, "2025-06-14T18:00:00Z", [dong(sp.id, "01:00 ngày đầu")]);
    await ban(kho.id, "2025-06-14T16:00:00Z", [dong(sp.id, "23:00 hôm trước")]);

    const { lines } = await collectSaleLines({ warehouseIds: [kho.id] });

    expect(lines.map((l) => l.product)).toEqual(["01:00 ngày đầu"]);
  });

  it("`months` thu hẹp cửa sổ thời gian", async () => {
    const kho = await taoKho("Kho Hà Nội");
    const sp = await taoSanPham(kho.id, "VT001", "Dầu nhớt", 5_000);
    await ban(kho.id, "2026-04-10T03:00:00Z", [dong(sp.id, "trong 3 tháng")]);
    await ban(kho.id, "2026-02-20T03:00:00Z", [dong(sp.id, "quá 3 tháng")]);

    const { lines } = await collectSaleLines({ warehouseIds: [kho.id], months: 3 });

    expect(lines.map((l) => l.product)).toEqual(["trong 3 tháng"]);
  });

  it("chỉ lấy dòng bán của các kho được chọn", async () => {
    const hn = await taoKho("Kho Hà Nội");
    const km = await taoKho("Kho Khuyến mại");
    const spHn = await taoSanPham(hn.id, "VT001", "Dầu nhớt", 5_000);
    const spKm = await taoSanPham(km.id, "KM001", "Khăn lau", 0);
    await ban(hn.id, "2026-06-01T03:00:00Z", [dong(spHn.id, "bán ở Hà Nội")]);
    await ban(km.id, "2026-06-01T03:00:00Z", [dong(spKm.id, "bán ở kho KM")]);

    expect((await collectSaleLines({ warehouseIds: [hn.id] })).lines.map((l) => l.product)).toEqual([
      "bán ở Hà Nội",
    ]);
    expect(
      (await collectSaleLines({ warehouseIds: [hn.id, km.id] })).lines.map((l) => l.product).sort(),
    ).toEqual(["bán ở Hà Nội", "bán ở kho KM"]);
  });

  it("hoá đơn cũ (trước B6) chưa ghi warehouse_id vẫn tính theo kho của sản phẩm", async () => {
    const kho = await taoKho("Kho Hà Nội");
    const sp = await taoSanPham(kho.id, "VT001", "Dầu nhớt", 5_000);
    await ban(null, "2026-06-01T03:00:00Z", [dong(sp.id, "hoá đơn cũ")]);

    expect((await collectSaleLines({ warehouseIds: [kho.id] })).lines.map((l) => l.product)).toEqual([
      "hoá đơn cũ",
    ]);
  });

  // schema.ts: sales_invoice_items.product_id là ON DELETE SET NULL và comment
  // "lịch sử doanh thu phải đúng kể cả khi sản phẩm ... bị xoá". collectSaleLines
  // INNER JOIN products (và lọc kho qua products.warehouse_id) nên xoá sản phẩm
  // làm doanh thu cũ của nó biến mất khỏi báo cáo.
  it.todo("BUG: xoá sản phẩm (deleteProduct) làm mất toàn bộ doanh thu cũ của nó khỏi báo cáo");

  // it.fails: đỏ khi bug trên được sửa — lúc đó đổi thành `it` thường.
  it.fails("(tái hiện) xoá sản phẩm thì doanh thu cũ của nó vẫn còn trong báo cáo", async () => {
    const kho = await taoKho("Kho Hà Nội");
    const sp = await taoSanPham(kho.id, "VT001", "Dầu nhớt", 5_000);
    await ban(kho.id, "2026-05-01T03:00:00Z", [dong(sp.id, "Dầu nhớt")]);
    await ban(kho.id, "2026-06-01T03:00:00Z", [dong(sp.id, "Dầu nhớt")]);

    await deleteProduct(sp.id);

    expect((await collectSaleLines({ warehouseIds: [kho.id] })).total).toBe(2);
  });

  // Cùng gốc: lọc kho theo products.warehouse_id hiện tại thay vì sales_invoices.warehouse_id lúc bán.
  it.fails("(tái hiện) chuyển sản phẩm sang kho khác không kéo doanh thu cũ đi theo", async () => {
    const hn = await taoKho("Kho Hà Nội");
    const hcm = await taoKho("Kho HCM");
    const sp = await taoSanPham(hn.id, "VT001", "Dầu nhớt", 5_000);
    await ban(hn.id, "2026-06-01T03:00:00Z", [dong(sp.id, "bán ở Hà Nội")]);

    await updateProduct(sp.id, { warehouseId: hcm.id });

    expect((await collectSaleLines({ warehouseIds: [hn.id] })).total).toBe(1);
  });

  // `since` tính theo giờ địa phương (setHours) nhưng `date` lấy theo UTC
  // (toISOString). Đơn bán 06:30 ngày 01/04 giờ VN (= 23:30Z 31/03) bị ghi
  // "2026-03-31" → nhảy sang tháng 3 / quý 1.
  it.todo("BUG: ngày bán lấy theo UTC nên đơn 00:00–06:59 giờ VN bị tính vào ngày (và tháng/quý) trước");

  it.fails("(tái hiện) đơn 06:30 sáng 01/04 giờ VN được ghi ngày 2026-04-01", async () => {
    const kho = await taoKho("Kho Hà Nội");
    const sp = await taoSanPham(kho.id, "VT001", "Dầu nhớt", 5_000);
    await ban(kho.id, "2026-03-31T23:30:00Z", [dong(sp.id, "Dầu nhớt")]);

    const { lines } = await collectSaleLines({ warehouseIds: [kho.id] });

    expect(lines.map((l) => l.date)).toEqual(["2026-04-01"]);
  });
});
