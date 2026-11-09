import { NextResponse } from "next/server";
import { requireAdminUser, requireSessionUser } from "@/server/session";
import {
  SupplierCodeTakenError,
  countSupplierTransactions,
  deleteSupplier,
  getSupplierById,
  parseSupplierInput,
  updateSupplier,
} from "@/server/store/suppliers";

type Params = { params: Promise<{ id: string }> };

// id không phải UUID thì Postgres ném lỗi kiểu dữ liệu (→ 500) — coi như không tìm thấy.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notFound() {
  return NextResponse.json({ message: "Không tìm thấy nhà cung cấp." }, { status: 404 });
}

export async function GET(_request: Request, { params }: Params) {
  const { response } = await requireSessionUser();
  if (response) return response;

  const { id } = await params;
  const supplier = UUID_RE.test(id) ? await getSupplierById(id) : undefined;
  if (!supplier) return notFound();
  return NextResponse.json({ supplier });
}

export async function PATCH(request: Request, { params }: Params) {
  const { response } = await requireAdminUser();
  if (response) return response;

  const { id } = await params;
  const existing = UUID_RE.test(id) ? await getSupplierById(id) : undefined;
  if (!existing) return notFound();

  const body = await request.json().catch(() => ({}));
  const parsed = parseSupplierInput(body ?? {}, true);
  if (parsed.message !== undefined) {
    return NextResponse.json({ message: parsed.message }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ supplier: existing });
  }

  try {
    const supplier = await updateSupplier(id, parsed.data);
    return NextResponse.json({ supplier });
  } catch (err) {
    if (err instanceof SupplierCodeTakenError) {
      return NextResponse.json({ message: err.message }, { status: 409 });
    }
    throw err;
  }
}

// Nhà cung cấp đã có phiếu kho: lần đầu trả 409 + cảnh báo để giao diện hỏi lại người dùng;
// gọi lại với `?force=true` mới xoá (FK `on delete set null` — phiếu giữ nguyên, mất liên kết).
export async function DELETE(request: Request, { params }: Params) {
  const { response } = await requireAdminUser();
  if (response) return response;

  const { id } = await params;
  const existing = UUID_RE.test(id) ? await getSupplierById(id) : undefined;
  if (!existing) return notFound();

  const force = new URL(request.url).searchParams.get("force") === "true";
  if (!force) {
    const transactionCount = await countSupplierTransactions(id);
    if (transactionCount > 0) {
      return NextResponse.json(
        {
          message: `Nhà cung cấp "${existing.name}" đã có ${transactionCount} phiếu nhập kho. Xoá sẽ làm các phiếu đó mất liên kết với nhà cung cấp.`,
          transactionCount,
          requiresConfirmation: true,
        },
        { status: 409 },
      );
    }
  }

  await deleteSupplier(id);
  return new NextResponse(null, { status: 204 });
}
