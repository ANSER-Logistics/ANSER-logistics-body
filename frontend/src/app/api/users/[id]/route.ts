import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/session";
import {
  ASSIGNABLE_ROLES,
  countAdmins,
  deleteUser,
  findUserById,
  toPublicUser,
  updateUser,
} from "@/server/store/users";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ message: "Không có quyền truy cập." }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  if (body.role !== undefined && !ASSIGNABLE_ROLES.includes(body.role)) {
    return NextResponse.json({ message: "Vai trò không hợp lệ." }, { status: 400 });
  }

  const target = await findUserById(id);
  if (!target) {
    return NextResponse.json({ message: "Không tìm thấy tài khoản." }, { status: 404 });
  }

  if (body.role !== undefined && target.role === "admin" && (await countAdmins()) <= 1) {
    return NextResponse.json({ message: "Không thể hạ quyền admin cuối cùng." }, { status: 400 });
  }

  const user = await updateUser(id, { role: body.role });
  return NextResponse.json({ user: toPublicUser(user!) });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ message: "Không có quyền truy cập." }, { status: 403 });
  }

  const { id } = await params;
  if (id === admin.id) {
    return NextResponse.json({ message: "Không thể xoá tài khoản của chính bạn." }, { status: 400 });
  }

  const target = await findUserById(id);
  if (!target) {
    return NextResponse.json({ message: "Không tìm thấy tài khoản." }, { status: 404 });
  }
  if (target.role === "admin" && (await countAdmins()) <= 1) {
    return NextResponse.json({ message: "Không thể xoá admin cuối cùng." }, { status: 400 });
  }

  await deleteUser(id);
  return new NextResponse(null, { status: 204 });
}
