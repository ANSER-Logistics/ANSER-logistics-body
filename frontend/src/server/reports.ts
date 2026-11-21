import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { categories, inventoryTransactions, products, salesInvoiceItems, salesInvoices } from "@/server/db/schema";
import { evaluateAlerts } from "@/server/store/automation";
import { listCategories } from "@/server/store/categories";
import { listProducts } from "@/server/store/products";
import { invoiceInWarehouses, listInvoices } from "@/server/store/sales";
import { listWarehouses } from "@/server/store/warehouses";
import { DAY_MS, vnDisplayDate, vnStartOfDay, vnWeekday } from "@/server/vnTime";

const WEEKDAY_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

// Lọc theo kho LÚC BÁN (`invoiceInWarehouses`). Trước đây lọc qua
// `products.warehouseId` (hiện hành): xoá sản phẩm (productId → null) làm mất luôn
// doanh thu cũ khỏi báo cáo, và chuyển kho sản phẩm kéo theo doanh thu cũ sang kho
// mới — cả hai đều sai vì join vào trạng thái HIỆN TẠI của sản phẩm.
function scopedInvoiceIdsQuery(warehouseIds: string[]) {
  return db
    .selectDistinct({ id: salesInvoices.id })
    .from(salesInvoices)
    .leftJoin(salesInvoiceItems, eq(salesInvoiceItems.invoiceId, salesInvoices.id))
    .leftJoin(products, eq(salesInvoiceItems.productId, products.id))
    .where(invoiceInWarehouses(warehouseIds));
}

async function computeRevenueMetrics(warehouseIds: string[], sevenDaysAgo: Date) {
  const scopedIds = scopedInvoiceIdsQuery(warehouseIds);

  const [{ totalRevenue }] = await db
    .select({ totalRevenue: sql<number>`coalesce(sum(${salesInvoices.total}), 0)::integer` })
    .from(salesInvoices)
    .where(inArray(salesInvoices.id, scopedIds));

  const recentInvoiceTotals = await db
    .select({ total: salesInvoices.total, createdAt: salesInvoices.createdAt })
    .from(salesInvoices)
    .where(and(gte(salesInvoices.createdAt, sevenDaysAgo), inArray(salesInvoices.id, scopedIds)));

  const revenue7Days = recentInvoiceTotals.reduce((s, inv) => s + inv.total, 0);

  return { totalRevenue, revenue7Days, invoiceCount7Days: recentInvoiceTotals.length, recentInvoiceTotals };
}

export async function getReportSummary() {
  // Báo cáo luôn tổng hợp toàn bộ kho — lọc theo kho là tính năng riêng của trang Quản lý kho.
  const allWarehouses = await listWarehouses();
  const warehouseIds = allWarehouses.map((w) => w.id);

  const allProducts = await listProducts({ warehouseIds });
  const totalProducts = allProducts.length;
  const totalStockValue = allProducts.reduce((sum, p) => sum + p.stock * p.price, 0);

  const sevenDaysAgo = vnStartOfDay(new Date(Date.now() - 6 * DAY_MS));

  const recentTx = await db
    .select({
      type: inventoryTransactions.type,
      quantity: inventoryTransactions.quantity,
      createdAt: inventoryTransactions.createdAt,
    })
    .from(inventoryTransactions)
    .innerJoin(products, eq(inventoryTransactions.productId, products.id))
    .where(and(gte(inventoryTransactions.createdAt, sevenDaysAgo), inArray(products.warehouseId, warehouseIds)));

  const dailyFlow: { label: string; a: number; b: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = vnStartOfDay(new Date(Date.now() - i * DAY_MS));
    const nextDay = new Date(day.getTime() + DAY_MS);

    const dayTx = recentTx.filter((t) => t.createdAt >= day && t.createdAt < nextDay);
    dailyFlow.push({
      label: WEEKDAY_LABELS[vnWeekday(day)],
      a: dayTx.filter((t) => t.type === "import").reduce((s, t) => s + t.quantity, 0),
      b: dayTx.filter((t) => t.type === "export").reduce((s, t) => s + t.quantity, 0),
    });
  }

  const categoryList = await listCategories();
  const maxCategoryStock = Math.max(
    1,
    ...categoryList.map((cat) =>
      allProducts.filter((p) => p.categoryId === cat.id).reduce((s, p) => s + p.stock, 0),
    ),
  );
  const stockByCategory = categoryList.map((cat) => {
    const stock = allProducts.filter((p) => p.categoryId === cat.id).reduce((s, p) => s + p.stock, 0);
    return { label: cat.name, pct: Math.round((stock / maxCategoryStock) * 100) };
  });

  const recentImportsRaw = await db
    .select({
      counterparty: inventoryTransactions.counterparty,
      quantity: inventoryTransactions.quantity,
      createdAt: inventoryTransactions.createdAt,
      productName: products.name,
    })
    .from(inventoryTransactions)
    .innerJoin(products, eq(inventoryTransactions.productId, products.id))
    .where(and(eq(inventoryTransactions.type, "import"), inArray(products.warehouseId, warehouseIds)))
    .orderBy(desc(inventoryTransactions.createdAt))
    .limit(4);

  const recentImports = recentImportsRaw.map((row) => ({
    supplier: row.counterparty || row.productName,
    quantity: row.quantity,
    date: row.createdAt.toLocaleDateString("vi-VN"),
  }));

  const lowStockCount = allProducts.filter((p) => p.stock < 20).length;

  const alerts = await evaluateAlerts(warehouseIds);

  // --- Doanh thu (revenue) ---

  const { totalRevenue, revenue7Days, invoiceCount7Days, recentInvoiceTotals } = await computeRevenueMetrics(
    warehouseIds,
    sevenDaysAgo,
  );

  const dailyRevenue: { label: string; a: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = vnStartOfDay(new Date(Date.now() - i * DAY_MS));
    const nextDay = new Date(day.getTime() + DAY_MS);

    const dayInvoices = recentInvoiceTotals.filter((inv) => inv.createdAt >= day && inv.createdAt < nextDay);
    dailyRevenue.push({
      label: WEEKDAY_LABELS[vnWeekday(day)],
      a: dayInvoices.reduce((s, inv) => s + inv.total, 0),
    });
  }

  // LEFT JOIN products/categories (không INNER JOIN): một dòng hoá đơn của sản phẩm
  // đã bị xoá (productId → null) vẫn phải được tính vào doanh thu, chỉ là không rõ
  // thuộc danh mục nào — INNER JOIN trước đây loại thẳng dòng đó khỏi mọi tổng hợp.
  // Nhóm "Không rõ danh mục" (category = null) gồm CẢ sản phẩm đã xoá LẪN sản phẩm
  // còn nhưng chưa gán danh mục — khác 0 không có nghĩa là đã có sản phẩm bị xoá.
  const revenueByCategoryRaw = await db
    .select({
      category: categories.name,
      revenue: sql<number>`coalesce(sum(${salesInvoiceItems.lineTotal}), 0)::integer`,
    })
    .from(salesInvoiceItems)
    .innerJoin(salesInvoices, eq(salesInvoiceItems.invoiceId, salesInvoices.id))
    .leftJoin(products, eq(salesInvoiceItems.productId, products.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(invoiceInWarehouses(warehouseIds))
    .groupBy(categories.name);

  const maxCategoryRevenue = Math.max(1, ...revenueByCategoryRaw.map((r) => r.revenue));
  const revenueByCategory = categoryList.map((cat) => {
    const revenue = revenueByCategoryRaw.find((r) => r.category === cat.name)?.revenue ?? 0;
    return { label: cat.name, pct: Math.round((revenue / maxCategoryRevenue) * 100), revenue };
  });
  const uncategorizedRevenue = revenueByCategoryRaw.find((r) => r.category === null)?.revenue ?? 0;
  if (uncategorizedRevenue > 0) {
    revenueByCategory.push({
      label: "Không rõ danh mục",
      pct: Math.round((uncategorizedRevenue / maxCategoryRevenue) * 100),
      revenue: uncategorizedRevenue,
    });
  }

  const recentInvoiceRows = await listInvoices({ limit: 5, warehouseIds });
  const recentInvoices = recentInvoiceRows.map((inv) => ({
    customerName: inv.customerName,
    total: inv.total,
    date: inv.createdAt.toLocaleDateString("vi-VN"),
  }));

  // --- So sánh theo kho (hiện khi doanh nghiệp có nhiều hơn 1 kho) ---

  const byWarehouse = await Promise.all(
    warehouseIds.map(async (warehouseId) => {
      const warehouseName = allWarehouses.find((w) => w.id === warehouseId)?.name ?? "?";
      const warehouseProducts = await listProducts({ warehouseIds: [warehouseId] });
      const metrics = await computeRevenueMetrics([warehouseId], sevenDaysAgo);
      return {
        warehouseId,
        warehouseName,
        totalProducts: warehouseProducts.length,
        totalRevenue: metrics.totalRevenue,
        revenue7Days: metrics.revenue7Days,
      };
    }),
  );

  return {
    totalProducts,
    totalStockValue,
    lowStockCount,
    dailyFlow,
    stockByCategory,
    recentImports,
    products: allProducts,
    alerts,
    totalRevenue,
    revenue7Days,
    invoiceCount7Days,
    dailyRevenue,
    revenueByCategory,
    recentInvoices,
    byWarehouse,
  };
}

export type ReportSummary = Awaited<ReturnType<typeof getReportSummary>>;

export type SalesReportPeriod = "day" | "week" | "month";

// Dùng bởi workflow n8n "Báo cáo doanh số định kỳ" (day/week/month) — gọi qua
// /api/n8n/internal/daily-sales.
export async function getSalesReportForPeriod(period: SalesReportPeriod) {
  const since = new Date();
  let periodLabel: string;

  if (period === "day") {
    since.setTime(vnStartOfDay(since).getTime());
    periodLabel = `Hôm nay (${vnDisplayDate(since)})`;
  } else if (period === "week") {
    since.setTime(since.getTime() - 7 * DAY_MS);
    periodLabel = `7 ngày qua (từ ${vnDisplayDate(since)})`;
  } else {
    since.setTime(since.getTime() - 30 * DAY_MS);
    periodLabel = `30 ngày qua (từ ${vnDisplayDate(since)})`;
  }

  const invoices = await db
    .select({ id: salesInvoices.id, total: salesInvoices.total })
    .from(salesInvoices)
    .where(gte(salesInvoices.createdAt, since));

  const totalOrders = invoices.length;
  const totalRevenue = invoices.reduce((s, inv) => s + inv.total, 0);

  const invoiceIds = invoices.map((inv) => inv.id);
  const topProductsRaw =
    invoiceIds.length === 0
      ? []
      : await db
          .select({
            productName: salesInvoiceItems.productName,
            // quantity là numeric(14,3) — KHÔNG cast ::integer, sẽ cắt mất phần lẻ (vd bán
            // theo kg/lít). Driver pg trả numeric dạng string, chuyển bằng Number() bên dưới.
            qtySold: sql<string>`sum(${salesInvoiceItems.quantity})`,
            revenue: sql<number>`sum(${salesInvoiceItems.lineTotal})::integer`,
          })
          .from(salesInvoiceItems)
          .where(inArray(salesInvoiceItems.invoiceId, invoiceIds))
          .groupBy(salesInvoiceItems.productName)
          .orderBy(desc(sql`sum(${salesInvoiceItems.lineTotal})`))
          .limit(5);

  const topProducts = topProductsRaw.map((p) => ({ ...p, qtySold: Number(p.qtySold) }));

  return {
    periodLabel,
    totalOrders,
    totalRevenue,
    topProducts,
  };
}
