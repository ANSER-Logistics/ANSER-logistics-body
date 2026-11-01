import { and, asc, eq, ilike, inArray, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { categories, products } from "@/server/db/schema";
import { getOrCreateCategoryByName } from "@/server/store/categories";

export type Product = typeof products.$inferSelect & {
  category?: string;
};

export const PRODUCT_CATEGORIES = [
  "Nguyên vật liệu",
  "Bán thành phẩm",
  "Thành phẩm",
  "Phụ liệu",
] as const;

export const LOW_STOCK_THRESHOLD = 20;

export function productStatus(stock: number, threshold = LOW_STOCK_THRESHOLD) {
  if (stock <= 0) return "Hết hàng" as const;
  if (stock < threshold) return "Sắp hết" as const;
  return "Còn hàng" as const;
}

export async function listProducts(filter?: {
  search?: string;
  categoryId?: string;
  category?: string;
  warehouseIds?: string[];
}): Promise<Product[]> {
  const conditions = [];
  if (filter?.search) {
    conditions.push(ilike(products.name, `%${filter.search}%`));
  }
  if (filter?.categoryId) {
    conditions.push(eq(products.categoryId, filter.categoryId));
  } else if (filter?.category) {
    conditions.push(eq(categories.name, filter.category));
  }
  if (filter?.warehouseIds) {
    conditions.push(inArray(products.warehouseId, filter.warehouseIds));
  }

  const rows = await db
    .select({
      id: products.id,
      code: products.code,
      name: products.name,
      categoryId: products.categoryId,
      warehouseId: products.warehouseId,
      linkedProductId: products.linkedProductId,
      unit: products.unit,
      baseUnit: products.baseUnit,
      unitFactor: products.unitFactor,
      stock: products.stock,
      price: products.price,
      cost: products.cost,
      isReducedVat: products.isReducedVat,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
      category: categories.name,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(products.code));

  return rows.map((r) => ({
    ...r,
    category: r.category ?? "Chưa phân loại",
  }));
}

export async function getProductById(id: string): Promise<Product | undefined> {
  const rows = await db
    .select({
      id: products.id,
      code: products.code,
      name: products.name,
      categoryId: products.categoryId,
      warehouseId: products.warehouseId,
      linkedProductId: products.linkedProductId,
      unit: products.unit,
      baseUnit: products.baseUnit,
      unitFactor: products.unitFactor,
      stock: products.stock,
      price: products.price,
      cost: products.cost,
      isReducedVat: products.isReducedVat,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
      category: categories.name,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.id, id))
    .limit(1);

  if (!rows[0]) return undefined;
  return {
    ...rows[0],
    category: rows[0].category ?? "Chưa phân loại",
  };
}

async function generateProductCode() {
  const rows = await db.select({ count: sql<number>`count(*)` }).from(products);
  const next = (rows[0]?.count ?? 0) + 1;
  return `SP-${String(next).padStart(3, "0")}`;
}

export async function createProduct(input: {
  name: string;
  categoryId?: string | null;
  category?: string;
  unit: string;
  stock: number;
  price: number;
  /** Giá vốn đơn vị. Bỏ qua = CHƯA BIẾT (`null`), khác hẳn 0. */
  cost?: number | null;
  warehouseId: string;
}) {
  let resolvedCategoryId = input.categoryId ?? null;
  if (!resolvedCategoryId && input.category) {
    const cat = await getOrCreateCategoryByName(input.category);
    resolvedCategoryId = cat.id;
  }

  const code = await generateProductCode();
  const rows = await db
    .insert(products)
    .values({
      code,
      name: input.name,
      categoryId: resolvedCategoryId,
      unit: input.unit,
      stock: input.stock,
      price: input.price,
      cost: input.cost ?? null,
      warehouseId: input.warehouseId,
    })
    .returning();
  return rows[0];
}

export async function updateProduct(
  id: string,
  patch: Partial<{
    name: string;
    categoryId: string | null;
    category: string;
    unit: string;
    stock: number;
    price: number;
    cost: number | null;
    warehouseId: string;
  }>,
) {
  const updateData: Record<string, unknown> = { ...patch, updatedAt: new Date() };

  if (patch.category !== undefined && patch.categoryId === undefined) {
    if (patch.category) {
      const cat = await getOrCreateCategoryByName(patch.category);
      updateData.categoryId = cat.id;
    } else {
      updateData.categoryId = null;
    }
  }
  delete updateData.category;

  const rows = await db
    .update(products)
    .set(updateData)
    .where(eq(products.id, id))
    .returning();
  return rows[0];
}

export async function deleteProduct(id: string) {
  await db.delete(products).where(eq(products.id, id));
}
