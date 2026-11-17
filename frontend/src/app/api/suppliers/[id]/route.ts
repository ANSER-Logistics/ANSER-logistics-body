import { NextResponse } from "next/server";
import { jsonError, withErrorHandler } from "@/server/http";
import { requireAdminUser, requireSessionUser } from "@/server/session";
import {
  SupplierCodeTakenError,
  countSupplierTransactions,
  deleteSupplier,
  getSupplierById,
  patchSupplierSchema,
  updateSupplier,
} from "@/server/store/suppliers";
import { parseJsonBody } from "@/server/validation";

type Params = { params: Promise<{ id: string }> };

// id không phải UUID thì Postgres ném lỗi kiểu dữ liệu (→ 500) — coi như không tìm thấy.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notFound() {
  return jsonError("Không tìm thấy nhà cung cấp.", 404);
}

export const GET = withErrorHandler(async (_request: Request, { params }: Params) => {
  const { response } = await requireSessionUser();
  if (response) return response;

  const { id } = await params;
  const supplier = UUID_RE.test(id) ? await getSupplierById(id) : undefined;
  if (!supplier) return notFound();
  return NextResponse.json({ supplier });
});

export const PATCH = withErrorHandler(async (request: Request, { params }: Params) => {
  const { response } = await requireAdminUser();
  if (response) return response;

  const { id } = await params;
  const existing = UUID_RE.test(id) ? await getSupplierById(id) : undefined;
  if (!existing) return notFound();

  const { data: patch, response: invalid } = await parseJsonBody(request, patchSupplierSchema);
  if (invalid) return invalid;
  // Bỏ các trường không gửi — zod giữ key với giá trị `undefined`.
  const changes = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ supplier: existing });
  }

  try {
    const supplier = await updateSupplier(id, changes);
    return NextResponse.json({ supplier });
  } catch (err) {
    if (err instanceof SupplierCodeTakenError) return jsonError(err.message, 409);
    throw err;
  }
});

// Nhà cung cấp đã có phiếu kho: lần đầu trả 409 + cảnh báo để giao diện hỏi lại người dùng;
// gọi lại với `?force=true` mới xoá (FK `on delete set null` — phiếu giữ nguyên, mất liên kết).
export const DELETE = withErrorHandler(async (request: Request, { params }: Params) => {
  const { response } = await requireAdminUser();
  if (response) return response;

  const { id } = await params;
  const existing = UUID_RE.test(id) ? await getSupplierById(id) : undefined;
  if (!existing) return notFound();

  const force = new URL(request.url).searchParams.get("force") === "true";
  if (!force) {
    const transactionCount = await countSupplierTransactions(id);
    if (transactionCount > 0) {
      return jsonError(
        `Nhà cung cấp "${existing.name}" đã có ${transactionCount} phiếu nhập kho. Xoá sẽ làm các phiếu đó mất liên kết với nhà cung cấp.`,
        409,
        { extra: { transactionCount, requiresConfirmation: true } },
      );
    }
  }

  await deleteSupplier(id);
  return new NextResponse(null, { status: 204 });
});
