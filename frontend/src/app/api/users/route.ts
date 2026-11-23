import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, withErrorHandler } from "@/server/http";
import bcrypt from "bcryptjs";
import { requireAdmin } from "@/server/session";
import { ASSIGNABLE_ROLES, createUser, findUserByEmail, listUsers, toPublicUser } from "@/server/store/users";
import { getEmployeeById } from "@/server/store/employees";
import { optionalPhone, optionalText, parseJsonBody, requiredEmail, requiredText } from "@/server/validation";

const createUserSchema = z.object({
  firstName: requiredText("Thiếu thông tin bắt buộc."),
  lastName: requiredText("Thiếu thông tin bắt buộc."),
  email: requiredEmail("Thiếu thông tin bắt buộc."),
  phone: optionalPhone(),
  password: z.string({ error: "Thiếu thông tin bắt buộc." }).min(6, "Mật khẩu phải có ít nhất 6 ký tự."),
  role: z.enum(ASSIGNABLE_ROLES, { error: "Vai trò không hợp lệ." }).optional(),
  employeeId: optionalText("Nhân viên"),
});

export const GET = withErrorHandler(async () => {
  const admin = await requireAdmin();
  if (!admin) {
    return jsonError("Không có quyền truy cập.", 403);
  }
  const users = await listUsers();
  return NextResponse.json({ users: users.map(toPublicUser) });
});

export const POST = withErrorHandler(async (request: Request) => {
  const admin = await requireAdmin();
  if (!admin) {
    return jsonError("Không có quyền truy cập.", 403);
  }

  const { data, response: invalid } = await parseJsonBody(request, createUserSchema);
  if (invalid) return invalid;
  const { firstName, lastName, email, phone, password, role, employeeId } = data;
  if (await findUserByEmail(email)) {
    return jsonError("Email đã được sử dụng.", 409);
  }
  if (employeeId && !(await getEmployeeById(employeeId))) {
    return jsonError("Nhân viên không hợp lệ.", 400);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await createUser({ firstName, lastName, email, phone, passwordHash, role, employeeId });
  return NextResponse.json({ user: toPublicUser(user) }, { status: 201 });
});
