import { asc, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { warehouses } from "@/server/db/schema";

export type Warehouse = typeof warehouses.$inferSelect;

export async function listWarehouses() {
  return db.select().from(warehouses).orderBy(asc(warehouses.name));
}

export async function createWarehouse(name: string) {
  const [existing] = await db.select().from(warehouses).where(eq(warehouses.name, name)).limit(1);
  if (existing) {
    throw new Error("Tên kho đã tồn tại.");
  }
  const [warehouse] = await db.insert(warehouses).values({ name }).returning();
  return warehouse;
}

export async function updateWarehouse(id: string, patch: Partial<{ notificationEmail: string | null }>) {
  // Drizzle ném "No values to set" với .set({}) — patch rỗng thì trả bản ghi hiện tại thay vì 500.
  if (Object.values(patch).every((v) => v === undefined)) {
    const [current] = await db.select().from(warehouses).where(eq(warehouses.id, id));
    return current;
  }
  const [warehouse] = await db.update(warehouses).set(patch).where(eq(warehouses.id, id)).returning();
  return warehouse;
}
