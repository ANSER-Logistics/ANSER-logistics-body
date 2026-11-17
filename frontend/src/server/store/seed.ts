import { isNull } from "drizzle-orm";
import { db } from "@/server/db/client";
import { automationRules, inventoryTransactions, products, warehouses } from "@/server/db/schema";
import { LOW_STOCK_THRESHOLD } from "@/server/store/products";
import { listWarehouses } from "@/server/store/warehouses";

import { listCategories, seedCategories } from "@/server/store/categories";
import { ensureCompanySettingsRow } from "@/server/store/settings";
import { seedDemoUser } from "@/server/store/users";

const SEED_PRODUCTS = [
  { code: "SP-001", name: "Trục cán inox 304", categoryName: "Thành phẩm", unit: "Cái", stock: 320, price: 1250000 },
  {
    code: "SP-014",
    name: "Vòng bi công nghiệp",
    categoryName: "Bán thành phẩm",
    unit: "Cái",
    stock: 15,
    price: 480000,
  },
  { code: "SP-027", name: "Tấm nhôm 5mm", categoryName: "Nguyên vật liệu", unit: "Tấm", stock: 0, price: 620000 },
  { code: "SP-033", name: "Bulong M10 (hộp 100)", categoryName: "Phụ liệu", unit: "Hộp", stock: 540, price: 95000 },
  { code: "SP-041", name: "Motor giảm tốc 1HP", categoryName: "Thành phẩm", unit: "Cái", stock: 42, price: 3150000 },
];

const SEED_IMPORTS = [
  { code: "SP-027", counterparty: "Cty TNHH Vật Liệu An Phát", quantity: 45 },
  { code: "SP-033", counterparty: "Nhà cung cấp Thép Miền Nam", quantity: 128 },
  { code: "SP-014", counterparty: "Cty CP Bao Bì Việt", quantity: 12 },
  { code: "SP-041", counterparty: "Kho phụ liệu Hưng Thịnh", quantity: 8 },
];

// Idempotent: ensures at least 1 warehouse exists, and backfills any product
// left over from before multi-warehouse support (warehouse_id IS NULL) into it.
export async function ensureDefaultWarehouseAndBackfill() {
  let all = await listWarehouses();
  if (all.length === 0) {
    await db.insert(warehouses).values({ name: "Kho 1" });
    all = await listWarehouses();
  }
  const defaultWarehouseId = all[0].id;

  await db.update(products).set({ warehouseId: defaultWarehouseId }).where(isNull(products.warehouseId));

  return defaultWarehouseId;
}

// Idempotent: only seeds demo products when the products table is empty (fresh DB).
// Does NOT seed categories itself — call seedCategories() separately (see runStartupSeed).
// A DB that already has products from before categories existed must still get categories,
// which this function's products-emptiness guard would otherwise prevent.
export async function seedInitialData() {
  const existing = await db.select({ id: products.id }).from(products).limit(1);
  if (existing.length > 0) return;

  const warehouseId = await ensureDefaultWarehouseAndBackfill();
  const categoryList = await listCategories();
  const categoryMap = new Map(categoryList.map((c) => [c.name, c.id]));

  const inserted = await db
    .insert(products)
    .values(
      SEED_PRODUCTS.map((p) => ({
        code: p.code,
        name: p.name,
        categoryId: categoryMap.get(p.categoryName) ?? null,
        unit: p.unit,
        stock: p.stock,
        price: p.price,
        warehouseId,
      })),
    )
    .returning();

  for (const seed of SEED_IMPORTS) {
    const product = inserted.find((p) => p.code === seed.code);
    if (!product) continue;
    await db.insert(inventoryTransactions).values({
      productId: product.id,
      type: "import",
      quantity: seed.quantity,
      counterparty: seed.counterparty,
    });
  }

  await db.insert(automationRules).values({
    name: "Cảnh báo tồn kho thấp",
    type: "low_stock_alert",
    thresholdQty: LOW_STOCK_THRESHOLD,
    enabled: true,
  });
}

// Single entry point for server-startup seeding. Each step guards itself on its own
// table's state, so no step's precondition can accidentally skip another (see the
// products/categories bug this replaced, in seedInitialData's comment above).
export async function runStartupSeed() {
  await seedDemoUser();
  await ensureDefaultWarehouseAndBackfill();
  await seedCategories();
  await seedInitialData();
  await ensureCompanySettingsRow();
}
