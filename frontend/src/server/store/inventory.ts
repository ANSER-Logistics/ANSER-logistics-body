import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { inventoryTransactions, products, suppliers, warehouses } from "@/server/db/schema";
import { weightedAverageCost } from "@/server/store/inventoryCost";

export type TransactionType = "import" | "export";

export class ProductNotFoundError extends Error {}
export class SupplierNotFoundError extends Error {}
export class InsufficientStockError extends Error {}
export class InvalidTransactionError extends Error {}

export async function listTransactions(filter?: {
  type?: TransactionType;
  limit?: number;
  warehouseIds?: string[];
}) {
  const conditions = [];
  if (filter?.type) conditions.push(eq(inventoryTransactions.type, filter.type));
  if (filter?.warehouseIds) conditions.push(inArray(products.warehouseId, filter.warehouseIds));

  const rows = await db
    .select({
      id: inventoryTransactions.id,
      productId: inventoryTransactions.productId,
      type: inventoryTransactions.type,
      quantity: inventoryTransactions.quantity,
      unitCost: inventoryTransactions.unitCost,
      counterparty: inventoryTransactions.counterparty,
      note: inventoryTransactions.note,
      createdAt: inventoryTransactions.createdAt,
      productCode: products.code,
      productName: products.name,
      warehouseName: warehouses.name,
    })
    .from(inventoryTransactions)
    .innerJoin(products, eq(inventoryTransactions.productId, products.id))
    .innerJoin(warehouses, eq(products.warehouseId, warehouses.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(inventoryTransactions.createdAt))
    .limit(filter?.limit ?? 100);

  return rows;
}

export type InventoryTransactionWithProduct = Awaited<ReturnType<typeof listTransactions>>[number];

export { weightedAverageCost } from "@/server/store/inventoryCost";

// Theo mẫu createInvoice() (store/sales.ts): đọc sản phẩm, kiểm tra tồn, tính giá vốn bình
// quân, TẤT CẢ bên trong 1 db.transaction với `.for("update")` trên dòng sản phẩm — 2 phiếu
// ghi cùng lúc cho cùng sản phẩm phải xếp hàng, không đọc cùng một `stock` cũ rồi cùng ghi đè.
export async function createTransaction(input: {
  productId: string;
  type: TransactionType;
  /** Luôn dương — chiều nhập/xuất quyết định bởi `type`, không phải dấu của số này. */
  quantity: number;
  /** Đơn giá NHẬP của chính lô này (VND). Chỉ dùng cho phiếu nhập — phiếu xuất luôn tự lấy
   * giá vốn hiện hành của sản phẩm, bỏ qua trường này. `undefined`/`null` = chưa biết giá. */
  unitCost?: number | null;
  counterparty?: string;
  note?: string;
  /** Chỉ áp dụng cho phiếu nhập — bên bán hàng cho mình. */
  supplierId?: string;
  /** Người đang đăng nhập thực hiện phiếu (lấy từ session, không nhận từ client). */
  employeeId?: string;
}) {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new InvalidTransactionError("Số lượng phải lớn hơn 0.");
  }
  const unitCost = input.unitCost ?? null;
  if (unitCost !== null && (!Number.isFinite(unitCost) || unitCost < 0)) {
    throw new InvalidTransactionError("Đơn giá phải là số không âm.");
  }
  if (input.supplierId && input.type !== "import") {
    throw new InvalidTransactionError("Chỉ phiếu nhập mới gắn được nhà cung cấp.");
  }

  return db.transaction(async (tx) => {
    const [product] = await tx
      .select()
      .from(products)
      .where(eq(products.id, input.productId))
      .limit(1)
      .for("update");
    if (!product) {
      throw new ProductNotFoundError("Không tìm thấy sản phẩm.");
    }

    if (input.supplierId) {
      const [supplier] = await tx
        .select({ id: suppliers.id })
        .from(suppliers)
        .where(eq(suppliers.id, input.supplierId))
        .limit(1);
      if (!supplier) {
        throw new SupplierNotFoundError("Không tìm thấy nhà cung cấp.");
      }
    }

    // B1 — CÓ DẤU, cùng một `delta` dùng cho cả dòng sổ kho lẫn `products.stock`.
    // Phiếu xuất ghi `quantity` ÂM: khớp quy ước `stock = SUM(quantity)` mà
    // `/api/inventory/reconcile` đối chiếu — ghi dương ở đây từng làm sai lệch
    // vĩnh viễn giữa 2 nguồn số dư.
    const delta = input.type === "import" ? input.quantity : -input.quantity;

    if (input.type === "export" && product.stock + delta < 0) {
      throw new InsufficientStockError(
        `Tồn kho không đủ: còn ${product.stock}, yêu cầu xuất ${input.quantity}.`,
      );
    }

    // `unit_cost` LUÔN là giá vốn, không bao giờ là giá bán (xem chú thích tại
    // `inventoryTransactions.unitCost` trong schema.ts). Phiếu nhập: giá người dùng gõ
    // (giá nhập thật). Phiếu xuất: giá vốn HIỆN HÀNH của sản phẩm — không lấy đơn giá người
    // dùng gửi lên, vì con số gõ vào phiếu xuất thường là giá BÁN.
    const ledgerUnitCost = input.type === "import" ? unitCost : product.cost ?? null;

    // Chỉ phiếu NHẬP mới cập nhật giá vốn bình quân.
    const nextCost =
      input.type === "import"
        ? weightedAverageCost({
            oldStock: product.stock,
            oldCost: product.cost ?? null,
            inQty: input.quantity,
            inCost: unitCost,
          })
        : product.cost ?? null;

    const [created] = await tx
      .insert(inventoryTransactions)
      .values({
        productId: input.productId,
        type: input.type,
        quantity: delta,
        unitCost: ledgerUnitCost,
        supplierId: input.type === "import" ? input.supplierId : undefined,
        employeeId: input.employeeId,
        counterparty: input.counterparty,
        note: input.note,
        // sourceType/sourceId CẢ HAI để trống — phiếu thủ công không có chứng từ gốc nào để
        // trỏ tới. Ràng buộc `inv_tx_source_di_cung_nhau` bắt 2 cột này đi cùng nhau; ghi
        // `sourceType: "manual"` một mình (không có `sourceId`) sẽ vi phạm ràng buộc đó.
      })
      .returning();

    await tx
      .update(products)
      .set({
        stock: sql`${products.stock} + ${delta}`,
        cost: nextCost,
        updatedAt: new Date(),
      })
      .where(eq(products.id, input.productId));

    return created;
  });
}
