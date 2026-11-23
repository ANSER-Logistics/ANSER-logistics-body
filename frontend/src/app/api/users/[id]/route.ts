import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, withErrorHandler } from "@/server/http";
import { requireAdmin } from "@/server/session";
import { ASSIGNABLE_ROLES, countAdmins, deleteUser, findUserById, toPublicUser, updateUser } from "@/server/store/users";
import { parseJsonBody } from "@/server/validation";

const patchUserSchema = z.object({
  role: z.enum(ASSIGNABLE_ROLES, { error: "Vai trò không hợp lệ." }).optional(),
});

export const PATCH = withErrorHandler(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin();
  if (!admin) {
    return jsonError("Không có quyền truy cập.", 403);
  }

  const { id } = await params;
  const { data: body, response: invalid } = await parseJsonBody(request, patchUserSchema);
  if (invalid) return invalid;

  const target = await findUserById(id);
  if (!target) {
    return jsonError("Không tìm thấy tài khoản.", 404);
  }

  if (body.role !== undefined && target.role === "admin" && (await countAdmins()) <= 1) {
    return jsonError("Không thể hạ quyền admin cuối cùng.", 400);
  }

  const user = await updateUser(id, { role: body.role });
  return NextResponse.json({ user: toPublicUser(user!) });
});

export const DELETE = withErrorHandler(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin();
  if (!admin) {
    return jsonError("Không có quyền truy cập.", 403);
  }

  const { id } = await params;
  if (id === admin.id) {
    return jsonError("Không thể xoá tài khoản của chính bạn.", 400);
  }

  const target = await findUserById(id);
  if (!target) {
    return jsonError("Không tìm thấy tài khoản.", 404);
  }
  if (target.role === "admin" && (await countAdmins()) <= 1) {
    return jsonError("Không thể xoá admin cuối cùng.", 400);
  }

  await deleteUser(id);
  return new NextResponse(null, { status: 204 });
});
