import { asc, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { employees } from "@/server/db/schema";

export type Employee = typeof employees.$inferSelect;

export async function listEmployees() {
  return db.select().from(employees).orderBy(asc(employees.name));
}

export async function getEmployeeById(id: string) {
  const [employee] = await db.select().from(employees).where(eq(employees.id, id)).limit(1);
  return employee;
}

export async function createEmployee(input: {
  name: string;
  position?: string;
  phone?: string;
  email?: string;
  hireDate?: Date;
  warehouseId?: string;
  note?: string;
}) {
  const [employee] = await db.insert(employees).values(input).returning();
  return employee;
}

export async function updateEmployee(
  id: string,
  patch: Partial<{
    name: string;
    position: string | null;
    phone: string | null;
    email: string | null;
    hireDate: Date | null;
    warehouseId: string | null;
    note: string | null;
  }>,
) {
  // Drizzle ném "No values to set" với .set({}) — patch rỗng thì trả bản ghi hiện tại thay vì 500.
  if (Object.values(patch).every((v) => v === undefined)) return getEmployeeById(id);
  const [employee] = await db.update(employees).set(patch).where(eq(employees.id, id)).returning();
  return employee;
}

export async function deleteEmployee(id: string) {
  await db.delete(employees).where(eq(employees.id, id));
}
