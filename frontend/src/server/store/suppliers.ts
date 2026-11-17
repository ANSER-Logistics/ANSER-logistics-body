import { asc, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/client";
import { inventoryTransactions, suppliers } from "@/server/db/schema";
import { nullableEmail, nullablePhone, nullableText, numberLike, requiredText } from "@/server/validation";

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

const DEBT_MESSAGE = "Công nợ đầu kỳ phải là một số hợp lệ.";

// Không gửi / null / "" → NULL ("chưa biết công nợ", khác 0). Cho phép số âm.
const openingDebtField = z.union(
  [
    z.null(),
    z.literal("").transform(() => null),
    // numeric(18, 2): tối đa 16 chữ số phần nguyên.
    numberLike(DEBT_MESSAGE).pipe(z.number().refine((v) => Math.abs(v) < 1e16, DEBT_MESSAGE)),
  ],
  { error: DEBT_MESSAGE },
);

const supplierFields = {
  name: requiredText("Thiếu tên nhà cung cấp."),
  code: nullableText("Mã nhà cung cấp"),
  taxCode: nullableText("Mã số thuế"),
  phone: nullablePhone(),
  email: nullableEmail(),
  address: nullableText("Địa chỉ"),
  openingDebt: openingDebtField.optional(),
  note: nullableText("Ghi chú"),
};

// PATCH: trường không gửi = không đổi; "" / null = xoá giá trị.
export const patchSupplierSchema = z.object(supplierFields).partial();

// POST: trường không gửi = NULL, để `createSupplier` luôn nhận đủ `SupplierInput`.
export const createSupplierSchema = z.object(supplierFields).transform(
  (body): SupplierInput => ({
    name: body.name,
    code: body.code ?? null,
    taxCode: body.taxCode ?? null,
    phone: body.phone ?? null,
    email: body.email ?? null,
    address: body.address ?? null,
    openingDebt: body.openingDebt ?? null,
    note: body.note ?? null,
  }),
);

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
