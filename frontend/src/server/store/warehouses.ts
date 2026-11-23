import { asc, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { warehouses } from "@/server/db/schema";

export type Warehouse = typeof warehouses.$inferSelect;

export async function listWarehouses() {
  return db.select().from(warehouses).orderBy(asc(warehouses.name));
}

export class WarehouseNameTakenError extends Error {
  constructor() {
    super("Tên kho đã tồn tại.");
    this.name = "WarehouseNameTakenError";
  }
}

export async function createWarehouse(name: string) {
  const [existing] = await db.select().from(warehouses).where(eq(warehouses.name, name)).limit(1);
  if (existing) {
    throw new WarehouseNameTakenError();
  }
  const [warehouse] = await db.insert(warehouses).values({ name }).returning();
  return warehouse;
}

export async function updateWarehouse(id: string, patch: Partial<{ notificationEmail: string | null }>) {
  const [warehouse] = await db.update(warehouses).set(patch).where(eq(warehouses.id, id)).returning();
  return warehouse;
}
