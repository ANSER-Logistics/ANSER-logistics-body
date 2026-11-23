import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { jsonError, withErrorHandler } from "@/server/http";
import { updateUser, toPublicUser } from "@/server/store/users";
import { requireSessionUser } from "@/server/session";
import { nullablePhone, parseJsonBody, requiredText } from "@/server/validation";

const patchMeSchema = z
  .object({
    currentPassword: z.string({ error: "Mật khẩu hiện tại không hợp lệ." }).optional(),
    newPassword: z.string({ error: "Mật khẩu mới không hợp lệ." }).optional(),
    firstName: requiredText("Tên không được để trống.").optional(),
    lastName: requiredText("Họ không được để trống.").optional(),
    phone: nullablePhone(),
  })
  .superRefine((body, ctx) => {
    if (!body.currentPassword && !body.newPassword) return;
    if (!body.currentPassword || !body.newPassword) {
      ctx.addIssue({ code: "custom", message: "Thiếu mật khẩu hiện tại hoặc mật khẩu mới." });
    } else if (body.newPassword.length < 6) {
      ctx.addIssue({ code: "custom", message: "Mật khẩu mới phải có ít nhất 6 ký tự." });
    }
  });

export const GET = withErrorHandler(async () => {
  const { user, response } = await requireSessionUser();
  if (response) return response;
  return NextResponse.json({ user: toPublicUser(user) });
});

export const PATCH = withErrorHandler(async (request: Request) => {
  const { user, response } = await requireSessionUser();
  if (response) return response;

  const { data: body, response: invalid } = await parseJsonBody(request, patchMeSchema);
  if (invalid) return invalid;

  if (body.currentPassword && body.newPassword) {
    if (!(await bcrypt.compare(body.currentPassword, user.passwordHash))) {
      return jsonError("Mật khẩu hiện tại không đúng.", 400);
    }
    await updateUser(user.id, { passwordHash: bcrypt.hashSync(body.newPassword, 10) });
  }

  const profilePatch: Partial<{ firstName: string; lastName: string; phone: string | null }> = {};
  if (body.firstName !== undefined) profilePatch.firstName = body.firstName;
  if (body.lastName !== undefined) profilePatch.lastName = body.lastName;
  if (body.phone !== undefined) profilePatch.phone = body.phone;

  const updated = Object.keys(profilePatch).length > 0 ? await updateUser(user.id, profilePatch) : user;

  return NextResponse.json({ user: toPublicUser(updated!) });
});
