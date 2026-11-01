import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { categories } from "@/server/db/schema";

export type Category = typeof categories.$inferSelect;

export const DEFAULT_CATEGORIES = [
  "Nguyên vật liệu",
  "Bán thành phẩm",
  "Thành phẩm",
  "Phụ liệu",
] as const;

export async function listCategories(): Promise<Category[]> {
  return db.select().from(categories).orderBy(asc(categories.name));
}

export async function getCategoryById(id: string): Promise<Category | undefined> {
  const rows = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  return rows[0];
}

// Previously, the same word "Dầu nhớt" and "dầu nhớt" are considered different string to `eq()`
// Adding additional normalization steps:
// First, every character is normalized to Unicode (NFC), ensuring words typed using different OS/typing method will not only look the same, but also has the same bytes
// Then, the name is trimmed, double or more spaced will be replaced with single space
function normalizeCategoryName(name: string): string {
  return name.normalize("NFC").trim().replace(/\s+/g, " ");
}

export async function getOrCreateCategoryByName(name: string): Promise<Category> {
  const normalized = normalizeCategoryName(name);

  const existing = await db
    .select()
    .from(categories)
    .where(sql`lower(${categories.name}) = lower(${normalized})`)
    .limit(1);
  if (existing[0]) return existing[0];

  try {
    const inserted = await db.insert(categories).values({ name: normalized }).returning();
    return inserted[0];
  } catch {
    // Lost the race: another request inserted the same name (case-insensitively)
    // between our SELECT and INSERT. Re-select instead of surfacing the constraint error.
    const retry = await db
      .select()
      .from(categories)
      .where(sql`lower(${categories.name}) = lower(${normalized})`)
      .limit(1);
    if (retry[0]) return retry[0];
    throw new Error(`Không thể tạo hoặc tìm danh mục: ${normalized}`);
  }
}

export async function seedCategories(): Promise<Category[]> {
  const existing = await listCategories();
  if (existing.length > 0) return existing;

  const inserted = await db
    .insert(categories)
    .values(DEFAULT_CATEGORIES.map((name) => ({ name })))
    .returning();
  return inserted;
}