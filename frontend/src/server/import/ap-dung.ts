// Đối chiếu dòng đã đọc với dữ liệu đang có, rồi ghi — khi người đã xác nhận.
//
// HAI BƯỚC, KHÔNG PHẢI MỘT. `lapKeHoach` chỉ ĐỌC và trả về "sẽ thêm bao nhiêu,
// sẽ sửa bao nhiêu, sửa những gì". `apDung` mới ghi. Tách ra vì bước ở giữa là
// một con người nhìn vào bảng rồi bấm Xác nhận — giống hệt MISA/KiotViet. Một
// hàm vừa đối chiếu vừa ghi thì không chèn được người vào giữa, và một file cũ
// tải nhầm sẽ đè giá bán với tồn kho hiện tại mà không ai kịp thấy.

import { and, eq, isNotNull } from "drizzle-orm";

import { db } from "@/server/db/client";
import { categories, customers, inventoryTransactions, products, suppliers } from "@/server/db/schema";
import { getOrCreateCategoryByName } from "@/server/store/categories";
import type { DongDoc, KetQuaDoc, LoaiFile } from "./doc-excel";

/** Một trường sẽ đổi khi cập nhật — để bảng xem trước nói rõ đổi cái gì. */
export type ThayDoi = { truong: string; cu: unknown; moi: unknown };

export type MucKeHoach = {
  dong: DongDoc;
  /** Chỉ có khi `capNhat` — id bản ghi đang có. */
  idHienTai?: string;
  thayDoi?: ThayDoi[];
};

export type KeHoach = {
  loai: LoaiFile;
  themMoi: MucKeHoach[];
  capNhat: MucKeHoach[];
  /** Cập nhật mà KHÔNG có gì đổi — tách riêng để con số "sẽ sửa" nói đúng sự thật. */
  khongDoi: MucKeHoach[];
  loi: DongDoc[];
  boQua: DongDoc[];
  canhBao: string[];
};

function so(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined) return b === null || b === undefined;
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 1e-9;
  return String(a) === String(b);
}

/** Làm tròn về 3 chữ số thập phân — đúng độ chính xác `numeric(14,3)` sẽ lưu. */
function lam3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** So tên nhóm giống cách `getOrCreateCategoryByName` coi là trùng. */
function tenNhom(s: unknown): string | null {
  return typeof s === "string" ? s.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase() : null;
}

function themNeuKhac(ra: ThayDoi[], truong: string, cu: unknown, moi: unknown) {
  // `undefined` = file không nhắc tới trường này -> GIỮ NGUYÊN, không phải xoá.
  // Nhập một bản xuất thiếu cột không được biến thành lệnh xoá dữ liệu đang có.
  if (moi === undefined) return;
  if (!so(cu, moi)) ra.push({ truong, cu, moi });
}

// --------------------------------------------------------------------------
// Lập kế hoạch (CHỈ ĐỌC)
// --------------------------------------------------------------------------

export async function lapKeHoach(kq: KetQuaDoc): Promise<KeHoach> {
  const kh: KeHoach = {
    loai: kq.loai,
    themMoi: [],
    capNhat: [],
    khongDoi: [],
    loi: [],
    boQua: [],
    canhBao: [...kq.canhBao],
  };

  for (const d of kq.dong) {
    if (d.boQua) kh.boQua.push(d);
    else if (d.loi.length) kh.loi.push(d);
  }
  const nhap = kq.dong.filter((d) => !d.boQua && d.loi.length === 0);
  if (!nhap.length) return kh;

  // Tải TOÀN BỘ mã đang có rồi so trong bộ nhớ, thay vì một truy vấn IN(...)
  // dài 161 phần tử. Ba bảng này đếm bằng trăm dòng — bản xuất thật: 161 hàng
  // hoá, 105 khách, 43 nhà cung cấp.
  //
  // Thế nào là "trùng mã" phải khớp với ràng buộc unique của TỪNG bảng:
  //  - customers/suppliers: unique `lower(code)` -> so không phân biệt hoa thường.
  //  - products: unique `code` PHÂN BIỆT hoa thường, nên DB có thể có cả "VT001"
  //    lẫn "vt001". Khớp CHÍNH XÁC trước; chỉ khi không có mã nào khớp chính xác
  //    mới khớp không phân biệt hoa thường — và chỉ khi đúng MỘT ứng viên.
  const map = new Map<string, Record<string, unknown>>();
  /** products: mã chính xác -> dòng, và lower(mã) -> các dòng. */
  const chinhXac = new Map<string, Record<string, unknown>>();
  const theoThuong = new Map<string, Record<string, unknown>[]>();
  if (kq.loai === "hang_hoa") {
    const rows = await db
      .select({
        id: products.id,
        code: products.code,
        name: products.name,
        unit: products.unit,
        stock: products.stock,
        cost: products.cost,
        categoryId: products.categoryId,
        category: categories.name,
        isReducedVat: products.isReducedVat,
      })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id));
    for (const r of rows) {
      chinhXac.set(r.code, r);
      const k = r.code.toLowerCase();
      theoThuong.set(k, [...(theoThuong.get(k) ?? []), r]);
    }
  } else {
    const bang = kq.loai === "khach_hang" ? customers : suppliers;
    const rows = await db
      .select({
        id: bang.id,
        code: bang.code,
        name: bang.name,
        address: bang.address,
        taxCode: bang.taxCode,
        phone: bang.phone,
        openingDebt: bang.openingDebt,
      })
      .from(bang)
      .where(isNotNull(bang.code));
    rows.forEach((r) => {
      if (r.code) map.set(r.code.toLowerCase(), r);
    });
  }

  for (const d of nhap) {
    let ht: Record<string, unknown> | undefined;
    if (kq.loai === "hang_hoa") {
      ht = chinhXac.get(d.code);
      if (!ht) {
        const ungVien = theoThuong.get(d.code.toLowerCase()) ?? [];
        if (ungVien.length > 1) {
          // Không đoán: ghi nhầm vào mặt hàng khác là sai số liệu không ai thấy.
          kh.loi.push({
            ...d,
            loi: [`mã khớp nhiều mặt hàng chỉ khác hoa thường (${ungVien.map((r) => r.code).join(", ")})`],
          });
          continue;
        }
        ht = ungVien[0];
      }
    } else ht = map.get(d.code.toLowerCase());
    if (!ht) {
      kh.themMoi.push({ dong: d });
      continue;
    }

    const td: ThayDoi[] = [];
    themNeuKhac(td, "Tên", ht.name, d.name);
    if (kq.loai === "hang_hoa") {
      themNeuKhac(td, "Đơn vị tính", ht.unit, d.unit);
      // So trên con số DB SẼ LƯU (numeric(14,3)), không phải con số trong file:
      // tồn 5.0004 lưu thành 5.000, nên với tồn đang có 5 là "không đổi".
      themNeuKhac(td, "Tồn kho", ht.stock, d.stock === undefined ? undefined : lam3(d.stock));
      themNeuKhac(td, "Giá vốn", ht.cost, d.cost);
      themNeuKhac(td, "Giảm 2% VAT", ht.isReducedVat, d.isReducedVat);
      if (d.category !== undefined && tenNhom(ht.category) !== tenNhom(d.category)) {
        td.push({ truong: "Nhóm hàng", cu: ht.category ?? null, moi: d.category });
      }
    } else {
      themNeuKhac(td, "Địa chỉ", ht.address, d.address);
      themNeuKhac(td, "Mã số thuế", ht.taxCode, d.taxCode);
      themNeuKhac(td, "Điện thoại", ht.phone, d.phone);
      themNeuKhac(td, "Công nợ", ht.openingDebt, d.openingDebt);
    }
    const muc: MucKeHoach = { dong: d, idHienTai: ht.id as string, thayDoi: td };
    (td.length ? kh.capNhat : kh.khongDoi).push(muc);
  }
  return kh;
}

// --------------------------------------------------------------------------
// Ghi (chỉ gọi sau khi người xác nhận)
// --------------------------------------------------------------------------

export type KetQuaGhi = { them: number; sua: number; boQua: number; loi: string[] };

type GiaoDich = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Ghi MỘT dòng `adjustment` vào sổ kho cho phần tồn mà lượt nhập vừa đặt.
 *
 * Bất biến của cả hệ thống là `products.stock = SUM(inventory_transactions.quantity)`
 * (B1, `/api/inventory/reconcile` kiểm đúng điều này). Đặt `stock` mà không ghi
 * sổ thì mọi mặt hàng vừa nhập đều hiện "lệch" ở bộ đối chiếu, và lần nhập lại
 * sau ghi đè con số mà không để lại dấu vết chênh lệch đã đi đâu.
 *
 * Không có `sourceType`/`sourceId`: không có chứng từ gốc nào để trỏ về, chỉ có
 * một bản xuất tổng hợp — ràng buộc `inv_tx_source_di_cung_nhau` cho phép cả hai
 * cùng NULL. Lý do nằm ở `note`.
 */
async function ghiSoKho(
  tx: GiaoDich,
  a: {
    productId: string;
    warehouseId: string;
    delta: number;
    unitCost: number | null;
    employeeId?: string;
    note: string;
  },
) {
  // `quantity` là numeric(14,3): làm tròn về 3 chữ số trước khi so với 0, không
  // thì sai số dấu phẩy động (598.8 − 598.79999…) sinh ra một dòng rác ~1e-13.
  const quantity = Math.round(a.delta * 1000) / 1000;
  if (quantity === 0) return; // CHECK `inv_tx_quantity_khac_khong`
  await tx.insert(inventoryTransactions).values({
    productId: a.productId,
    warehouseId: a.warehouseId,
    type: "adjustment",
    quantity,
    unitCost: a.unitCost,
    employeeId: a.employeeId,
    note: a.note,
  });
}

export async function apDung(kq: KetQuaDoc, warehouseId?: string, employeeId?: string): Promise<KetQuaGhi> {
  const kh = await lapKeHoach(kq);
  const ra: KetQuaGhi = { them: 0, sua: 0, boQua: kh.boQua.length + kh.khongDoi.length, loi: [] };

  if (kq.loai === "hang_hoa" && !warehouseId) {
    throw new Error(
      "Chưa chọn kho. Bản xuất `Danh sách hàng hoá, dịch vụ` của MISA không có " +
        "cột kho nào, mà `products.warehouse_id` là bắt buộc — nên kho phải do " +
        "người chọn, không đoán được.",
    );
  }

  // Danh mục tạo TRƯỚC giao dịch: `getOrCreateCategoryByName` tự mở giao dịch
  // riêng, lồng nó vào trong đây là giữ khoá lâu vô ích. Số nhóm rất ít (bản
  // xuất thật: 3 nhóm cho 161 mặt hàng) nên vòng này gần như không tốn gì.
  const idNhom = new Map<string, string>();
  if (kq.loai === "hang_hoa") {
    for (const ten of new Set([...kh.themMoi, ...kh.capNhat].map((m) => m.dong.category).filter(Boolean) as string[])) {
      idNhom.set(ten, (await getOrCreateCategoryByName(ten)).id);
    }
  }

  // MỘT giao dịch cho cả lượt nhập. Nửa chừng gãy mà đã ghi được 80 dòng là
  // trạng thái tệ nhất: người dùng không biết nhập lại có an toàn không.
  await db.transaction(async (tx) => {
    if (kq.loai === "hang_hoa") {
      for (const m of kh.themMoi) {
        const d = m.dong;
        const stock = lam3(d.stock ?? 0);
        const [moi] = await tx
          .insert(products)
          .values({
            code: d.code,
            name: d.name,
            warehouseId: warehouseId!,
            categoryId: d.category ? (idNhom.get(d.category) ?? null) : null,
            unit: d.unit || "Cái",
            stock,
            cost: d.cost ?? null,
            isReducedVat: d.isReducedVat ?? null,
          })
          .returning({ id: products.id });
        await ghiSoKho(tx, {
          productId: moi.id,
          warehouseId: warehouseId!,
          delta: stock,
          unitCost: d.cost ?? null,
          employeeId,
          note: `Nhập Excel MISA: tồn đầu ${stock}`,
        });
        ra.them++;
      }
      for (const m of kh.capNhat) {
        const d = m.dong;
        // Chỉ ghi trường file CÓ nhắc tới (bất biến 7): `undefined` = giữ nguyên,
        // đúng như bảng xem trước đã hứa với người bấm Xác nhận. Ghi `stock ?? 0`
        // hay `unit || "Cái"` ở đây là xoá dữ liệu mà màn hình không hề báo.
        const stock = d.stock === undefined ? undefined : lam3(d.stock);
        // Đọc lại tồn TRONG giao dịch và khoá dòng: con số ở bước xem trước có
        // thể đã cũ (một hoá đơn bán vừa trừ kho giữa lúc xem và lúc xác nhận),
        // và chênh lệch ghi vào sổ kho phải tính trên tồn thật ngay lúc ghi.
        const [ht] = await tx
          .select({ stock: products.stock, warehouseId: products.warehouseId, cost: products.cost })
          .from(products)
          .where(eq(products.id, m.idHienTai!))
          .for("update");
        await tx
          .update(products)
          .set({
            name: d.name,
            ...(d.unit ? { unit: d.unit } : {}),
            ...(stock !== undefined ? { stock } : {}),
            ...(d.cost !== undefined ? { cost: d.cost } : {}),
            ...(d.isReducedVat !== undefined ? { isReducedVat: d.isReducedVat } : {}),
            ...(d.category ? { categoryId: idNhom.get(d.category) ?? null } : {}),
            updatedAt: new Date(),
          })
          .where(eq(products.id, m.idHienTai!));
        if (stock !== undefined) {
          await ghiSoKho(tx, {
            productId: m.idHienTai!,
            warehouseId: ht.warehouseId,
            delta: stock - ht.stock,
            unitCost: d.cost === undefined ? ht.cost : d.cost,
            employeeId,
            note: `Nhập Excel MISA: điều chỉnh tồn ${ht.stock} → ${stock}`,
          });
        }
        ra.sua++;
      }
    } else {
      const bang = kq.loai === "khach_hang" ? customers : suppliers;
      for (const m of kh.themMoi) {
        const d = m.dong;
        await tx.insert(bang).values({
          code: d.code,
          name: d.name,
          address: d.address ?? null,
          taxCode: d.taxCode ?? null,
          phone: d.phone ?? null,
          openingDebt: d.openingDebt ?? null,
        });
        ra.them++;
      }
      for (const m of kh.capNhat) {
        const d = m.dong;
        await tx
          .update(bang)
          .set({
            // Ô trống / cột thiếu (`undefined`) = giữ nguyên, không phải xoá.
            name: d.name,
            ...(d.address !== undefined ? { address: d.address } : {}),
            ...(d.taxCode !== undefined ? { taxCode: d.taxCode } : {}),
            ...(d.phone !== undefined ? { phone: d.phone } : {}),
            ...(d.openingDebt !== undefined ? { openingDebt: d.openingDebt } : {}),
          })
          .where(and(eq(bang.id, m.idHienTai!)));
        ra.sua++;
      }
    }
  });

  ra.loi = kh.loi.map((d) => `dòng ${d.dongExcel}: ${d.loi.join(", ")}`);
  return ra;
}
