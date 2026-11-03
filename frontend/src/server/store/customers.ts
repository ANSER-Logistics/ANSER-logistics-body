import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { customers, salesInvoices } from "@/server/db/schema";

export type Customer = typeof customers.$inferSelect;

export function customerType(invoiceCount: number) {
  return invoiceCount === 0 ? ("Khách hàng mới" as const) : ("Khách hàng cũ" as const);
}

export async function listCustomers(search?: string) {
  const rows = await db
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
      email: customers.email,
      address: customers.address,
      note: customers.note,
      createdAt: customers.createdAt,
      invoiceCount: sql<number>`count(${salesInvoices.id})::integer`,
      totalSpent: sql<number>`coalesce(sum(${salesInvoices.total}), 0)::integer`,
      lastOrderAt: sql<Date | null>`max(${salesInvoices.createdAt})`,
    })
    .from(customers)
    .leftJoin(salesInvoices, eq(salesInvoices.customerId, customers.id))
    .where(search ? sql`${customers.name} ilike ${`%${search}%`}` : undefined)
    .groupBy(customers.id)
    .orderBy(asc(customers.name));

  return rows;
}

export type CustomerWithStats = Awaited<ReturnType<typeof listCustomers>>[number];

export async function getCustomerById(id: string) {
  const [customer] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  return customer;
}

export async function createCustomer(input: {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  note?: string;
}) {
  const [customer] = await db.insert(customers).values(input).returning();
  return customer;
}

export async function updateCustomer(
  id: string,
  patch: Partial<{
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    note: string | null;
  }>,
) {
  const [customer] = await db.update(customers).set(patch).where(eq(customers.id, id)).returning();
  return customer;
}

export async function deleteCustomer(id: string) {
  await db.delete(customers).where(eq(customers.id, id));
}
