import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { employees, inventoryTransactions, products, salesInvoiceItems, salesInvoices } from "@/server/db/schema";
import { InsufficientStockError } from "@/server/store/inventory";

export type SalesInvoice = typeof salesInvoices.$inferSelect;
export type SalesInvoiceItem = typeof salesInvoiceItems.$inferSelect;

export class CrossWarehouseError extends Error {}
export class NoItemError extends Error {}
export class ProductNotFoundError extends Error {}

/**
 * Điều kiện "hoá đơn thuộc một trong các kho này", theo kho LÚC BÁN.
 *
 * Câu truy vấn dùng nó phải join `salesInvoices` và LEFT JOIN `products` (qua
 * `salesInvoiceItems.productId`) — không INNER JOIN, nếu không dòng bán của sản
 * phẩm đã xoá (productId → null) sẽ bị loại.
 *
 * 1. `salesInvoices.warehouseId` — chụp lại lúc tạo hoá đơn, không đổi khi sản
 *    phẩm bị xoá hay chuyển kho. Đây là nguồn đúng.
 * 2. Hoá đơn tạo TRƯỚC migration 0012 (B6) có `warehouse_id = NULL` — migration
 *    chỉ thêm cột, không điền lại. Với chúng, lùi về kho HIỆN TẠI của sản phẩm:
 *    không hoàn hảo (sản phẩm đã xoá thì không còn biết kho), nhưng còn hơn bỏ
 *    hẳn doanh thu cũ khỏi mọi kho.
 */
export function invoiceInWarehouses(warehouseIds: string[]) {
  return or(
    inArray(salesInvoices.warehouseId, warehouseIds),
    and(isNull(salesInvoices.warehouseId), inArray(products.warehouseId, warehouseIds)),
  );
}

export async function listInvoices(filter?: { limit?: number; warehouseIds?: string[] }) {
  const limit = filter?.limit ?? 50;

  if (filter?.warehouseIds) {
    const scopedInvoiceIds = db
      .selectDistinct({ id: salesInvoiceItems.invoiceId })
      .from(salesInvoiceItems)
      .innerJoin(products, eq(salesInvoiceItems.productId, products.id))
      .where(inArray(products.warehouseId, filter.warehouseIds));

    return db
      .select()
      .from(salesInvoices)
      .where(inArray(salesInvoices.id, scopedInvoiceIds))
      .orderBy(desc(salesInvoices.createdAt))
      .limit(limit);
  }

  return db.select().from(salesInvoices).orderBy(desc(salesInvoices.createdAt)).limit(limit);
}

export async function getInvoiceById(id: string) {
  const [invoice] = await db.select().from(salesInvoices).where(eq(salesInvoices.id, id)).limit(1);
  if (!invoice) return undefined;
  const items = await db.select().from(salesInvoiceItems).where(eq(salesInvoiceItems.invoiceId, id));
  return { invoice, items };
}

export async function createInvoice(input: {
  customerId?: string;
  customerName: string;
  employeeId?: string;
  note?: string;
  items: { productId: string; quantity: number }[];
}) {
  // Merge duplicate product lines so stock is checked against the combined quantity.
  const quantityByProduct = new Map<string, number>();
  for (const item of input.items) {
    quantityByProduct.set(item.productId, (quantityByProduct.get(item.productId) ?? 0) + item.quantity);
  }

  // .transaction: A function to tell Drizzle to execute everthing inside as one database transaction
  // If an error were to happen inside the function, the transaction is rolled back, ensuring no partially-created invoice
  return db.transaction(async (tx) => {
    const lineItems: {
      productId: string;
      productName: string;
      employeeId?: string;
      unit: string;
      unitPrice: number;
      unitCost: number | null;
      quantity: number;
      lineTotal: number;
      warehouseId: string;
    }[] = [];

    for (const [productId, quantity] of quantityByProduct) {
      const [product] = await tx.select().from(products).where(eq(products.id, productId)).limit(1).for("update");
      if (!product) {
        throw new ProductNotFoundError("Không tìm thấy sản phẩm.");
      }
      if (product.stock < quantity) {
        throw new InsufficientStockError(
          `Tồn kho không đủ cho ${product.name}: còn ${product.stock}, yêu cầu ${quantity}.`,
        );
      }
      lineItems.push({
        productId,
        productName: product.name,
        employeeId: input.employeeId,
        unit: product.unit,
        unitPrice: product.price,
        // CHỤP LẠI giá vốn tại thời điểm bán. Giá vốn trôi theo mỗi lần nhập
        // hàng, nên đọc `products.cost` lúc làm báo cáo là lấy giá HÔM NAY
        // gán cho đơn bán sáu tháng trước — lãi gộp sai mà không ai thấy.
        // `null` giữ nguyên là chưa biết, không quy về 0.
        unitCost: product.cost ?? null,
        quantity,
        lineTotal: product.price * quantity,
        warehouseId: product.warehouseId,
      });
    }

    // Added an edge case check: What if there's no item? AKA What if lineItems is empty?
    // Then lineItems.map((item) => item.warehouseId) is an empty array []
    // new Set([]) = 0 -> [...distinctWarehouse][0] has nothing AKA undefined
    if (lineItems.length === 0) {
      throw new NoItemError("Hoá đơn phải có ít nhất 1 sản phẩm");
    }
    // A set is iterable, but it does not have array indexing
    // E.g: const warehouses = new Set(["warehouse-A"]);
    // We can't do warehouses[0]
    // But we can convert warehouses in to an array [warehouses]
    const distinctWarehouses = new Set(lineItems.map((item) => item.warehouseId));
    if (distinctWarehouses.size > 1) {
      throw new CrossWarehouseError("Một hoá đơn chỉ được bán sản phẩm trong cùng 1 kho.");
    }
    // Destructure that array into only the Id part [...warehouses][0]
    const warehouseId = [...distinctWarehouses][0];

    const total = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);

    const [invoice] = await tx
      .insert(salesInvoices)
      .values({ customerId: input.customerId, customerName: input.customerName, warehouseId, note: input.note, total })
      .returning();

    for (const item of lineItems) {
      await tx.insert(salesInvoiceItems).values({
        invoiceId: invoice.id,
        productId: item.productId,
        productName: item.productName,
        unit: item.unit,
        unitPrice: item.unitPrice,
        unitCost: item.unitCost,
        quantity: item.quantity,
        lineTotal: item.lineTotal,
      });

      // `item.quantity` luôn dương (số lượng bán). Bán hàng là xuất kho nên trừ
      // vào tồn — dấu ngược lại thì mỗi lần bán hàng tồn kho lại tăng lên.
      await tx
        .update(products)
        .set({ stock: sql`${products.stock} - ${item.quantity}`, updatedAt: new Date() })
        .where(eq(products.id, item.productId));

      await tx.insert(inventoryTransactions).values({
        productId: item.productId,
        employeeId: item.employeeId,
        type: "export",
        // B1: xuất kho mang dấu âm — khớp quy ước `stock = SUM(quantity)`.
        quantity: -item.quantity,
        // `unitCost` LUÔN là giá vốn, kể cả ở dòng xuất — không bao giờ là giá
        // bán. Ghi giá bán vào đây là biến sổ kho thành sổ doanh thu.
        unitCost: item.unitCost,
        sourceType: "sale", // Check constrain 'inv_tx_source_type_hop_le'
        sourceId: invoice.id, // Link stock transaction to salesInvoices.id
        counterparty: input.customerName,
        note: `Xuất theo hoá đơn bán hàng`,
      });
    }

    return invoice;
  });
}
