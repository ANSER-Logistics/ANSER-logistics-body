import { asc, eq, or, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { inventoryTransactions, suppliers } from "@/server/db/schema";

export type Supplier = typeof suppliers.$inferSelect;

export type SupplierInput = {
  code: string | null;
  name: string;
  taxCode: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  // NULL = chưa biết công nợ, khác 0. Cho phép số âm (đã trả trước cho nhà cung cấp).
  openingDebt: number | null;
  note: string | null;
};

// Trùng `lower(code)` với nhà cung cấp khác (unique index `suppliers_code_unique`).
export class SupplierCodeTakenError extends Error {
  constructor(public code: string) {
    super(`Mã nhà cung cấp "${code}" đã tồn tại.`);
  }
}

const TEXT_FIELDS = ["code", "taxCode", "phone", "email", "address", "note"] as const;

// Kiểm tra body cho POST (partial = false) và PATCH (partial = true). Chuỗi rỗng → NULL.
// Tạm viết tay — việc 5 (zod) sẽ thay bằng schema dùng chung.
export function parseSupplierInput(
  body: Record<string, unknown>,
  partial: boolean,
): { data: Partial<SupplierInput>; message?: undefined } | { data?: undefined; message: string } {
  const data: Partial<SupplierInput> = {};

  if (body.name !== undefined || !partial) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return { message: "Thiếu tên nhà cung cấp." };
    data.name = name;
  }

  for (const field of TEXT_FIELDS) {
    const value = body[field];
    if (value === undefined) {
      if (!partial) data[field] = null;
      continue;
    }
    if (value !== null && typeof value !== "string") {
      return { message: `Trường "${field}" phải là chuỗi.` };
    }
    data[field] = value?.trim() || null;
  }

  if (body.openingDebt !== undefined || !partial) {
    const raw = body.openingDebt;
    if (raw === undefined || raw === null || raw === "") {
      data.openingDebt = null;
    } else {
      const debt = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
      // numeric(18, 2): tối đa 16 chữ số phần nguyên.
      if (!Number.isFinite(debt) || Math.abs(debt) >= 1e16) {
        return { message: "Công nợ đầu kỳ phải là một số hợp lệ." };
      }
      data.openingDebt = debt;
    }
  }

  return { data };
}

// Drizzle bọc lỗi Postgres trong `cause`, nên kiểm cả hai tầng.
function isUniqueViolation(err: unknown) {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

export async function listSuppliers(search?: string) {
  const pattern = `%${search}%`;
  const rows = await db
    .select({
      id: suppliers.id,
      code: suppliers.code,
      name: suppliers.name,
      taxCode: suppliers.taxCode,
      phone: suppliers.phone,
      email: suppliers.email,
      address: suppliers.address,
      openingDebt: suppliers.openingDebt,
      note: suppliers.note,
      createdAt: suppliers.createdAt,
      importCount: sql<number>`count(${inventoryTransactions.id})::integer`,
      lastImportAt: sql<Date | null>`max(${inventoryTransactions.createdAt})`,
    })
    .from(suppliers)
    .leftJoin(inventoryTransactions, eq(inventoryTransactions.supplierId, suppliers.id))
    .where(
      search
        ? or(
            sql`${suppliers.name} ilike ${pattern}`,
            sql`${suppliers.code} ilike ${pattern}`,
            sql`${suppliers.taxCode} ilike ${pattern}`,
          )
        : undefined,
    )
    .groupBy(suppliers.id)
    .orderBy(asc(suppliers.name));

  return rows;
}

export type SupplierWithStats = Awaited<ReturnType<typeof listSuppliers>>[number];

export async function getSupplierById(id: string) {
  const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1);
  return supplier;
}

// Số phiếu kho đang trỏ tới nhà cung cấp — xoá nhà cung cấp sẽ làm các phiếu này mất liên kết
// (FK `on delete set null`).
export async function countSupplierTransactions(id: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::integer` })
    .from(inventoryTransactions)
    .where(eq(inventoryTransactions.supplierId, id));
  return row.count;
}

export async function createSupplier(input: SupplierInput) {
  try {
    const [supplier] = await db.insert(suppliers).values(input).returning();
    return supplier;
  } catch (err) {
    if (isUniqueViolation(err) && input.code) throw new SupplierCodeTakenError(input.code);
    throw err;
  }
}

export async function updateSupplier(id: string, patch: Partial<SupplierInput>) {
  try {
    const [supplier] = await db.update(suppliers).set(patch).where(eq(suppliers.id, id)).returning();
    return supplier;
  } catch (err) {
    if (isUniqueViolation(err) && patch.code) throw new SupplierCodeTakenError(patch.code);
    throw err;
  }
}

export async function deleteSupplier(id: string) {
  await db.delete(suppliers).where(eq(suppliers.id, id));
}
